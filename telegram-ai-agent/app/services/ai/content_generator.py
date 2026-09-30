"""Content Generator — yangilikdan professional Telegram post, qayta yozish, hashtag."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import structlog

from app.constants import ChannelTone, Language
from app.services.ai.client import AIRouter

log = structlog.get_logger()

_PROMPT_DIR = Path(__file__).parent / "prompts"

_LANG_LABEL = {
    Language.UZ: "o'zbek",
    Language.RU: "rus",
    Language.EN: "ingliz",
}
_TONE_LABEL = {
    ChannelTone.PROFESSIONAL: "professional va rasmiy",
    ChannelTone.CASUAL: "yengil va do'stona",
    ChannelTone.TECHNICAL: "texnik va batafsil",
    ChannelTone.NEWS: "quruq yangilik uslubi",
    ChannelTone.MARKETING: "marketing va targ'ibot",
}

DEFAULT_MAX_HASHTAGS = 5


@dataclass(slots=True)
class GeneratedPost:
    """Yaratilgan post natijasi."""

    title: str
    body: str
    hashtags: list[str] = field(default_factory=list)
    provider: str = ""
    model: str = ""


@lru_cache(maxsize=8)
def _load_persona(language: Language) -> str:
    """Til bo'yicha persona (system) promptini o'qiydi va keshlaydi."""
    path = _PROMPT_DIR / f"post_{language.value}.txt"
    if not path.exists():
        path = _PROMPT_DIR / "post_en.txt"
    return path.read_text(encoding="utf-8").strip()


def _parse_json(text: str) -> dict:
    """Model javobidan JSON qismini ajratib oladi (code-fence'larga chidamli)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned[:4].lower() == "json":
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


class ContentGenerator:
    """AI orqali post/hashtag yaratadi va yangilikni qayta yozadi."""

    def __init__(self, router: AIRouter | None = None) -> None:
        self._router = router or AIRouter()

    # --------------------------- 1) Professional post -------------------------
    async def generate_post(
        self,
        *,
        title: str,
        summary: str = "",
        url: str | None = None,
        language: Language = Language.UZ,
        tone: ChannelTone = ChannelTone.PROFESSIONAL,
        max_hashtags: int = DEFAULT_MAX_HASHTAGS,
    ) -> GeneratedPost:
        """Yangilikdan kanal uslubiga mos professional post yaratadi (JSON natija)."""
        system = _load_persona(language)
        summary_display = summary or "(berilmagan)"
        url_display = url or "(havola yo'q)"
        prompt = "\n".join(
            [
                "Quyidagi yangilik asosida bitta professional Telegram post tayyorla.",
                "",
                f"SARLAVHA: {title}",
                f"QISQACHA MAZMUN: {summary_display}",
                f"MANBA HAVOLASI: {url_display}",
                "",
                "Talablar:",
                f"- Til: {_LANG_LABEL.get(language, 'ingliz')}",
                f"- Uslub: {_TONE_LABEL.get(tone, 'professional')}",
                "- Postni o'z so'zlaring bilan qayta yoz (manbani ko'chirma).",
                f"- {max_hashtags} tagacha mavzuga mos hashtag (# bilan).",
                "",
                "Javobni FAQAT quyidagi JSON ko'rinishida qaytar, boshqa hech narsa yozma:",
                '{"title": "qisqa sarlavha", "body": "post matni", "hashtags": ["#tag1", "#tag2"]}',
            ]
        )

        completion = await self._router.complete(system=system, prompt=prompt)

        try:
            data = _parse_json(completion.text)
            hashtags = [str(h) for h in data.get("hashtags", [])][:max_hashtags]
            return GeneratedPost(
                title=str(data.get("title") or title),
                body=str(data.get("body") or completion.text),
                hashtags=hashtags,
                provider=completion.provider,
                model=completion.model,
            )
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            # JSON qaytmasa ham ishimiz to'xtamasin — xom matnni post sifatida olamiz.
            log.warning("ai.post.json_parse_failed", error=str(exc), provider=completion.provider)
            return GeneratedPost(
                title=title,
                body=completion.text,
                hashtags=[],
                provider=completion.provider,
                model=completion.model,
            )

    # ------------------------------ 2) Qayta yozish ---------------------------
    async def rewrite_news(
        self, *, text: str, language: Language = Language.UZ
    ) -> str:
        """IT yangiligini berilgan tilda professional qayta yozadi (oddiy matn)."""
        system = _load_persona(language)
        prompt = "\n".join(
            [
                f"Quyidagi yangilikni {_LANG_LABEL.get(language, 'ingliz')} tilida",
                "professional qilib qayta yoz. Faktlarni saqla, o'z so'zlaring bilan yoz.",
                "Faqat qayta yozilgan matnni qaytar (hashtag yoki izohsiz):",
                "",
                text,
            ]
        )
        completion = await self._router.complete(system=system, prompt=prompt)
        return completion.text

    # ------------------------------ 3) Hashtag --------------------------------
    async def generate_hashtags(
        self,
        *,
        text: str,
        language: Language = Language.UZ,
        max_hashtags: int = DEFAULT_MAX_HASHTAGS,
    ) -> list[str]:
        """Matn uchun mavzuga mos hashtaglar yaratadi."""
        system = _load_persona(language)
        prompt = "\n".join(
            [
                f"Quyidagi matn uchun {max_hashtags} tagacha mavzuga mos hashtag tanla.",
                "Javobni FAQAT JSON massiv ko'rinishida qaytar, masalan:",
                '["#IT", "#AI", "#texnologiya"]',
                "",
                text,
            ]
        )
        completion = await self._router.complete(
            system=system, prompt=prompt, max_tokens=256
        )
        try:
            raw = completion.text.strip()
            start = raw.find("[")
            end = raw.rfind("]")
            if start != -1 and end != -1 and end > start:
                raw = raw[start : end + 1]
            tags = json.loads(raw)
            return [str(t) for t in tags][:max_hashtags]
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            log.warning("ai.hashtags.parse_failed", error=str(exc))
            return []
