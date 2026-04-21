"""
Base classes for all collectors.

Every collector implements BaseCollector and returns a CollectorResult.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.utils.types import ContactDict, DescriptionDict, ImageDict, ReviewDict


@dataclass
class CollectorResult:
    """Standardised output from every collector."""

    collector_name: str
    status: str = "success"  # "success", "failed", "skipped", "not_configured"
    error_message: str | None = None
    raw_response: dict[str, Any] = field(default_factory=dict)

    # Extracted data (each collector populates what it can)
    descriptions: list[DescriptionDict] = field(default_factory=list)
    attributes: list[dict[str, Any]] = field(default_factory=list)
    # Each entry: {"attribute_code": str, "value": Any}

    contact: ContactDict = field(default_factory=dict)

    images: list[ImageDict] = field(default_factory=list)

    reviews: list[ReviewDict] = field(default_factory=list)

    tags: dict[str, str] = field(default_factory=dict)
    # Free-form tags for downstream collectors (e.g., OSM wikipedia/wikidata tags)

    entity_types: list[str] = field(default_factory=list)
    # Optional schema.org-style types inferred by enrichment collectors.


class BaseCollector(ABC):
    """Abstract base for all data collectors."""

    name: str = ""
    requires_api_key: bool = False
    api_key_env_var: str = ""

    @abstractmethod
    async def collect(
        self,
        place_code: str,
        lat: float,
        lng: float,
        name: str,
        existing_data: dict[str, Any] | None = None,
    ) -> CollectorResult:
        """
        Fetch data for a single place.

        Args:
            place_code: Stable place identifier.
            lat, lng: Coordinates.
            name: Place display name.
            existing_data: Data already collected by earlier collectors
                           (e.g., OSM tags needed by Wikipedia collector).

        Returns:
            CollectorResult with extracted data.
        """

    def is_available(self) -> bool:
        """
        Check whether this collector can run.

        For collectors that require an API key, checks the relevant env var.
        Collectors that are always free return True.
        """
        if not self.requires_api_key:
            return True
        return bool(os.environ.get(self.api_key_env_var))

    def _get_api_key(self) -> str | None:
        """Return the API key from the environment, or None."""
        return os.environ.get(self.api_key_env_var) or None

    def _skip_result(self, reason: str) -> CollectorResult:
        """Helper: return a 'skipped' result."""
        return CollectorResult(
            collector_name=self.name,
            status="skipped",
            error_message=reason,
        )

    def _not_configured_result(self) -> CollectorResult:
        """Helper: return a 'not_configured' result."""
        return CollectorResult(
            collector_name=self.name,
            status="not_configured",
            error_message=f"API key not set ({self.api_key_env_var})",
        )

    def _fail_result(self, error: str) -> CollectorResult:
        """Helper: return a 'failed' result."""
        return CollectorResult(
            collector_name=self.name,
            status="failed",
            error_message=error,
        )
