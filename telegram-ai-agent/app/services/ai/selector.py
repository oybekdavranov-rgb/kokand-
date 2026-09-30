"""News Selector — AI yordamida eng muhim N ta yangilikni tanlaydi (ixtiyoriy bosqich)."""
from __future__ import annotations

import json

import structlog

from app.constants import Language
from app.services.ai.client import AIRouter

log = structlog.get_logger()


class NewsSelector:
    """Yangiliklar ro'yxatidan eng muhimlarini AI orqali tanlaydi."""

    def __init__(self, router: AIRouter | None = None) -> None:
        self._router = router or AIRouter()

    async def select_top(
        self,
        items: list[dict],
        n: int,
        *,
        language: Language = Language.UZ,
    ) -> list[int]:
        """items: [{"title":..., "summary":...}]. Tanlangan indekslar ro'yxatini qaytaradi.

        Xatolik yoki noaniqlikda oddiy fallback: birinchi n ta indeks.
        """
        if not items:
            return []
        if len(items) <= n:
            return list(range(len(items)))

        listing = "\n".join(
            f"{i}. {item.get('title', '')}" for i, item in enumerate(items)
        )
        system = (
            "Sen tajribali IT muharririsan. Vazifang — eng muhim, dolzarb va "
            "o'quvchi uchun qiziqarli yangiliklarni tanlash."
        )
        prompt = "\n".join(
            [
                f"Quyidagi yangiliklardan eng muhim {n} tasini tanla.",
                "Javobni FAQAT tanlangan raqamlar (indekslar) JSON massivida qaytar,",
                f"masalan: [0, 3, 5]. Aynan {n} ta indeks bo'lsin.",
                "",
                listing,
            ]
        )

        try:
            completion = await self._router.complete(
                system=system, prompt=prompt, max_tokens=128
            )
            raw = completion.text.strip()
            start = raw.find("[")
            end = raw.rfind("]")
            if start != -1 and end != -1 and end > start:
                raw = raw[start : end + 1]
            indices = json.loads(raw)
            valid = [int(i) for i in indices if 0 <= int(i) < len(items)]
            # Takrorlarni olib tashlab, n tagacha qisqartiramiz
            seen: list[int] = []
            for idx in valid:
                if idx not in seen:
                    seen.append(idx)
            return seen[:n] if seen else list(range(n))
        except Exception as exc:  # noqa: BLE001 — fallback: birinchi n ta
            log.warning("ai.selector.failed", error=str(exc))
            return list(range(n))
