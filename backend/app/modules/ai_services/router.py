import uuid
import json
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
import httpx

from app.database import get_db
from app.models.models import (
    Staff, Shift, ShiftAssignment, WellnessCheckin,
    User, UserRole, ShiftType, StaffStatus
)
from app.utils.dependencies import get_current_user, DeptHeadAndAbove, HRAdminAndAbove
from app.config import settings

router = APIRouter(prefix="/ai", tags=["AI Services"])


# ─────────────────────────────────────────────────────────────────────────────
# MULTI-PROVIDER AI ENGINE
# Chain: Gemini → OpenAI → Groq (order from AI_PROVIDER_CHAIN in .env)
# Each provider is tried in order; first success wins.
# ─────────────────────────────────────────────────────────────────────────────

async def _call_gemini(prompt: str, system: str) -> str:
    """Google Gemini via REST API."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    )
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"maxOutputTokens": 1500, "temperature": 0.3},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def _call_openai(prompt: str, system: str) -> str:
    """OpenAI GPT via official REST API."""
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": settings.OPENAI_MODEL,
        "messages": messages,
        "max_tokens": 1500,
        "temperature": 0.3,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_groq(prompt: str, system: str) -> str:
    """Groq — ultra-fast LLaMA3 inference via OpenAI-compatible API."""
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set")

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "max_tokens": 1500,
        "temperature": 0.3,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# Provider registry — maps name → async function
PROVIDERS = {
    "gemini": _call_gemini,
    "openai": _call_openai,
    "groq": _call_groq,
}


async def call_ai(prompt: str, system: str = "", task: str = "") -> dict:
    """
    Execute the AI provider chain defined in AI_PROVIDER_CHAIN (.env).
    Returns: { "result": str, "provider": str, "fallback_used": bool }

    Default chain: gemini → openai → groq
    Each provider is tried in order; first success wins.
    All failures result in a 503 with details on which providers were tried.
    """
    chain = [p.strip() for p in settings.AI_PROVIDER_CHAIN.split(",") if p.strip()]
    errors = {}

    for i, provider_name in enumerate(chain):
        fn = PROVIDERS.get(provider_name)
        if not fn:
            errors[provider_name] = "Unknown provider name"
            continue
        try:
            result = await fn(prompt, system)
            return {
                "result": result,
                "provider": provider_name,
                "fallback_used": i > 0,
                "task": task,
            }
        except Exception as e:
            errors[provider_name] = str(e)
            print(f"[AI] {provider_name} failed: {e}" + (
                f", trying {chain[i+1]}" if i + 1 < len(chain) else ", no more providers"
            ))

    raise HTTPException(
        status_code=503,
        detail={
            "message": "All AI providers failed",
            "chain": chain,
            "errors": errors,
        },
    )


def _clean_json(raw: str) -> dict:
    """Strip markdown fences and parse JSON from AI response."""
    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


# ─────────────────────────────────────────────────────────────────────────────
# PROVIDER STATUS ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/providers", summary="Show configured AI provider chain and key status")
async def get_providers(current_user: User = Depends(HRAdminAndAbove)):
    chain = [p.strip() for p in settings.AI_PROVIDER_CHAIN.split(",") if p.strip()]
    return {
        "chain": chain,
        "providers": {
            "gemini": {
                "configured": bool(settings.GEMINI_API_KEY),
                "model": settings.GEMINI_MODEL,
            },
            "openai": {
                "configured": bool(settings.OPENAI_API_KEY),
                "model": settings.OPENAI_MODEL,
            },
            "groq": {
                "configured": bool(settings.GROQ_API_KEY),
                "model": settings.GROQ_MODEL,
            },
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class SchedulingSuggestRequest(BaseModel):
    department_id: uuid.UUID
    week_start: date


class WellnessAnalysisRequest(BaseModel):
    staff_id: uuid.UUID
    energy_level: int   # 1–5
    stress_level: int   # 1–5
    mood: str           # good / neutral / poor
    free_text: Optional[str] = None


class OnboardingParseRequest(BaseModel):
    cv_text: str


class NaturalLanguageLeaveRequest(BaseModel):
    message: str


class AITestRequest(BaseModel):
    prompt: str
    system: Optional[str] = ""
    preferred_provider: Optional[str] = None   # override chain for this call


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULING INTELLIGENCE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/scheduling/suggest", summary="AI shift fill suggestions for a department")
async def ai_scheduling_suggest(
    payload: SchedulingSuggestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(DeptHeadAndAbove),
):
    week_end = payload.week_start + timedelta(days=6)

    shifts_result = await db.execute(
        select(Shift).where(
            and_(
                Shift.department_id == payload.department_id,
                Shift.shift_date >= payload.week_start,
                Shift.shift_date <= week_end,
            )
        )
    )
    shifts = shifts_result.scalars().all()

    staff_result = await db.execute(
        select(Staff).where(
            and_(
                Staff.department_id == payload.department_id,
                Staff.status == StaffStatus.ACTIVE,
                Staff.fatigue_score < 70,
            )
        )
    )
    available_staff = staff_result.scalars().all()

    if not shifts or not available_staff:
        return {"suggestions": [], "message": "No shifts or available staff found", "provider": None}

    shift_data = [
        {
            "date": str(s.shift_date), "type": s.shift_type.value,
            "start": s.start_time, "end": s.end_time, "min_staff": s.min_staff,
        }
        for s in shifts
    ]
    staff_data = [
        {
            "id": str(s.id),
            "name": f"{s.first_name} {s.last_name}",
            "role": s.job_title,
            "fatigue_score": s.fatigue_score,
            "employment_type": s.employment_type.value,
        }
        for s in available_staff
    ]

    system = (
        "You are an intelligent hospital scheduling assistant. "
        "Suggest optimal staff assignments for shifts based on fatigue scores (lower is better, max safe is 70), "
        "fair distribution, and minimum staffing requirements. "
        "Return ONLY valid JSON — no markdown, no preamble — in this exact format: "
        '{"suggestions": [{"shift_date": "YYYY-MM-DD", "shift_type": "...", '
        '"recommended_staff": [{"staff_id": "...", "name": "...", "reason": "..."}]}]}'
    )
    prompt = (
        f"Week: {payload.week_start} to {week_end}\n"
        f"Shifts: {json.dumps(shift_data)}\n"
        f"Available staff: {json.dumps(staff_data)}\n"
        "Suggest best assignments. Distribute fairly, minimise fatigue risk."
    )

    ai = await call_ai(prompt, system, task="scheduling_suggest")

    try:
        parsed = _clean_json(ai["result"])
        return {**parsed, "provider": ai["provider"], "fallback_used": ai["fallback_used"]}
    except json.JSONDecodeError:
        return {
            "suggestions": [], "provider": ai["provider"],
            "raw_response": ai["result"], "error": "AI returned non-JSON",
        }


# ─────────────────────────────────────────────────────────────────────────────
# CV PARSING — ONBOARDING
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/onboarding/parse-cv", summary="AI parses CV text into structured staff profile")
async def parse_cv(
    payload: OnboardingParseRequest,
    current_user: User = Depends(HRAdminAndAbove),
):
    system = (
        "You are an HR document parser for a hospital system. "
        "Extract structured information from CVs and return ONLY valid JSON — no markdown, no preamble. "
        "Format: {"
        '"first_name": "", "last_name": "", "email": "", "phone": "", '
        '"date_of_birth": "YYYY-MM-DD or null", "job_title": "", '
        '"clinical_sub_role": "doctor|nurse|pharmacist|lab_technician|radiologist|physiotherapist|other|null", '
        '"credentials": [{"type": "", "issuing_body": "", "registration_number": "", "expiry_date": "YYYY-MM-DD or null"}], '
        '"qualifications": [{"degree": "", "institution": "", "year": ""}], '
        '"experience_years": 0}'
    )
    prompt = f"Extract structured HR data from this CV:\n\n{payload.cv_text[:4000]}"

    ai = await call_ai(prompt, system, task="cv_parse")

    try:
        parsed = _clean_json(ai["result"])
        return {
            "parsed": parsed,
            "provider": ai["provider"],
            "fallback_used": ai["fallback_used"],
            "note": "Verify all details before saving to staff profile",
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail={
            "message": "AI could not parse CV into structured format",
            "provider": ai["provider"],
            "raw": ai["result"],
        })


# ─────────────────────────────────────────────────────────────────────────────
# WELLNESS SENTIMENT ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/wellness/analyse", summary="AI analyses wellness check-in and computes burnout risk")
async def analyse_wellness(
    payload: WellnessAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Staff can only submit their own
    if current_user.role in (UserRole.CLINICAL_STAFF, UserRole.ADMIN_STAFF, UserRole.SUPPORT_STAFF):
        result = await db.execute(select(Staff).where(Staff.user_id == current_user.id))
        own = result.scalar_one_or_none()
        if not own or own.id != payload.staff_id:
            raise HTTPException(status_code=403, detail="You can only submit your own wellness check-in")

    system = (
        "You are a clinical wellbeing analyst for a hospital HR system. "
        "Analyse the staff member's wellness check-in data and return ONLY valid JSON — no markdown. "
        "Format: {"
        '"sentiment_score": 0.0-1.0, '
        '"burnout_risk": "low|medium|high", '
        '"key_signals": ["..."], '
        '"suggested_action": "..."} '
        "sentiment_score: 1.0 = very positive, 0.0 = very negative. "
        "burnout_risk based on energy, stress, mood combination and free text."
    )
    prompt = (
        f"Staff wellness check-in:\n"
        f"- Energy level: {payload.energy_level}/5\n"
        f"- Stress level: {payload.stress_level}/5\n"
        f"- Mood: {payload.mood}\n"
        f"- Note: \"{payload.free_text or 'None'}\"\n"
        "Provide burnout risk assessment."
    )

    provider_used = None
    try:
        ai = await call_ai(prompt, system, task="wellness_analysis")
        provider_used = ai["provider"]
        analysis = _clean_json(ai["result"])
    except Exception:
        # Rule-based fallback — wellness never goes down
        avg = (payload.energy_level + (6 - payload.stress_level)) / 10
        burnout = "high" if avg < 0.4 else ("medium" if avg < 0.65 else "low")
        analysis = {
            "sentiment_score": round(avg, 2),
            "burnout_risk": burnout,
            "key_signals": ["Rule-based fallback — all AI providers unavailable"],
            "suggested_action": "Review with line manager" if burnout != "low" else "Continue monitoring",
        }
        provider_used = "rule_based_fallback"

    # Save check-in
    checkin = WellnessCheckin(
        staff_id=payload.staff_id,
        energy_level=payload.energy_level,
        stress_level=payload.stress_level,
        mood=payload.mood,
        free_text=payload.free_text,
        ai_sentiment_score=analysis.get("sentiment_score"),
        burnout_risk=analysis.get("burnout_risk", "low"),
    )
    db.add(checkin)
    await db.commit()

    return {"checkin_saved": True, "analysis": analysis, "provider": provider_used}


# ─────────────────────────────────────────────────────────────────────────────
# NATURAL LANGUAGE LEAVE PARSER
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/leave/parse", summary="Parse natural language leave request into structured dates")
async def parse_leave_request(
    payload: NaturalLanguageLeaveRequest,
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    system = (
        f"You are an HR assistant parsing natural language leave requests. "
        f"Today is {today}. Return ONLY valid JSON — no markdown. "
        f"Format: {{\"leave_type\": \"annual|sick|maternity|paternity|compassionate|study|unpaid\", "
        f"\"start_date\": \"YYYY-MM-DD\", \"end_date\": \"YYYY-MM-DD\", \"reason\": \"brief or null\"}} "
        f"If dates cannot be determined, return {{\"error\": \"Could not parse dates\"}}"
    )
    prompt = f'Parse this leave request: "{payload.message}"'

    ai = await call_ai(prompt, system, task="leave_parse")

    try:
        parsed = _clean_json(ai["result"])
        return {
            "parsed": parsed,
            "original_message": payload.message,
            "provider": ai["provider"],
            "fallback_used": ai["fallback_used"],
        }
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse leave request into structured dates")


# ─────────────────────────────────────────────────────────────────────────────
# AI TEST ENDPOINT — HR Admin only, for verifying provider health
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/test", summary="Test AI provider chain with a custom prompt")
async def test_ai(
    payload: AITestRequest,
    current_user: User = Depends(HRAdminAndAbove),
):
    """
    Allows HR Admin / Super Admin to test the AI chain directly.
    Optionally override which provider to use for this call only.
    """
    if payload.preferred_provider:
        fn = PROVIDERS.get(payload.preferred_provider)
        if not fn:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {payload.preferred_provider}. Options: {list(PROVIDERS.keys())}")
        try:
            result = await fn(payload.prompt, payload.system or "")
            return {"result": result, "provider": payload.preferred_provider, "fallback_used": False}
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"{payload.preferred_provider} failed: {str(e)}")

    ai = await call_ai(payload.prompt, payload.system or "", task="test")
    return ai
