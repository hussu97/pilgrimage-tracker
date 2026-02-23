"""
Collectors package — each collector fetches data from a single external source.
"""

from app.collectors.base import BaseCollector, CollectorResult

__all__ = ["BaseCollector", "CollectorResult"]
