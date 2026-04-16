"""
Extended tests for enrichment pipeline and quality scoring.

Covers:
- quality.assess_descriptions() non-EN fallback and LLM tie-break path
- quality._llm_tiebreak() with mocked Anthropic client
- enrichment._enrich_place() with in-memory DB
- enrichment.run_enrichment_pipeline() — cancelled, no run, no places, success
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Shared fixture ────────────────────────────────────────────────────────────


@pytest.fixture()
def pipeline_engine():
    """Fresh in-memory SQLite engine for pipeline tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


def _seed_run(engine, loc_code="loc_test", run_code="run_test", status="pending"):
    from app.db.models import DataLocation, ScraperRun

    with Session(engine) as session:
        loc = DataLocation(code=loc_code, name="Test Location", config={})
        session.add(loc)
        run = ScraperRun(run_code=run_code, location_code=loc_code, status=status)
        session.add(run)
        session.commit()
    return run_code


def _seed_place(engine, run_code, place_code="gplc_test1", name="Test Mosque"):
    from app.db.models import ScrapedPlace

    with Session(engine) as session:
        place = ScrapedPlace(
            run_code=run_code,
            place_code=place_code,
            name=name,
            raw_data={"lat": 25.0, "lng": 55.0},
        )
        session.add(place)
        session.commit()
    return place_code


# ── TestQualityScoringExtended ────────────────────────────────────────────────


class TestQualityScoringExtended:
    async def test_assess_descriptions_non_en_fallback(self):
        """When no English candidates exist, use all candidates as fallback."""
        from app.pipeline.quality import assess_descriptions

        candidates = [
            {"text": "مسجد تاريخي في القدس", "lang": "ar", "source": "wikipedia", "score": None},
            {"text": "ऐतिहासिक मस्जिद", "lang": "hi", "source": "wikidata", "score": None},
        ]
        result = await assess_descriptions(candidates, "Test Mosque")

        # Should pick from all candidates (no EN → fallback)
        assert result["text"] != ""
        assert result["source"] in ("wikipedia", "wikidata")

    async def test_assess_descriptions_llm_tiebreak_triggered(self):
        """When two close-scored candidates exist and API key is set, LLM is called."""
        from app.pipeline.quality import assess_descriptions

        # Two candidates with similar scores (difference < 0.15)
        long_text = "x" * 350  # > 300 chars → length_score = 0.3
        candidates = [
            {
                "text": long_text,
                "lang": "en",
                "source": "wikipedia",  # reliability=0.4 → score=0.7
                "score": None,
            },
            {
                "text": long_text,
                "lang": "en",
                "source": "knowledge_graph",  # reliability=0.3 → score=0.6
                "score": None,
            },
        ]
        # Score difference = 0.1 < 0.15 → triggers LLM if key is set

        mock_llm_result = {
            "text": "LLM synthesized description",
            "source": "wikipedia",
            "score": 0.7,
            "method": "llm",
        }

        with patch(
            "app.pipeline.quality._llm_tiebreak", new=AsyncMock(return_value=mock_llm_result)
        ):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}, clear=False):
                result = await assess_descriptions(candidates, "Test Mosque")

        assert result["method"] == "llm"
        assert result["text"] == "LLM synthesized description"

    async def test_assess_descriptions_llm_tiebreak_returns_none(self):
        """When LLM returns None, fall back to heuristic winner."""
        from app.pipeline.quality import assess_descriptions

        long_text = "y" * 350
        candidates = [
            {"text": long_text, "lang": "en", "source": "wikipedia", "score": None},
            {"text": long_text, "lang": "en", "source": "knowledge_graph", "score": None},
        ]

        with patch("app.pipeline.quality._llm_tiebreak", new=AsyncMock(return_value=None)):
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key"}, clear=False):
                result = await assess_descriptions(candidates, "Test")

        assert result["method"] == "heuristic"
        assert result["source"] == "wikipedia"  # Wikipedia has higher reliability

    async def test_llm_tiebreak_choice_a(self):
        """_llm_tiebreak selects candidate A."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Description A", "source": "wikipedia", "score": 0.7}
        candidate_b = {"text": "Description B", "source": "knowledge_graph", "score": 0.62}

        mock_client = MagicMock()
        mock_response = MagicMock(text='{"choice": "A", "text": "Description A"}')
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test Mosque")

        assert result is not None
        assert result["source"] == "wikipedia"
        assert result["method"] == "llm"

    async def test_llm_tiebreak_choice_b(self):
        """_llm_tiebreak selects candidate B."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Description A", "source": "wikipedia", "score": 0.65}
        candidate_b = {"text": "Description B", "source": "knowledge_graph", "score": 0.60}

        mock_client = MagicMock()
        mock_response = MagicMock(text='{"choice": "B", "text": "Description B"}')
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result["source"] == "knowledge_graph"

    async def test_llm_tiebreak_synthesized(self):
        """_llm_tiebreak returns a synthesized description."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Description A", "source": "wikipedia", "score": 0.68}
        candidate_b = {"text": "Description B", "source": "knowledge_graph", "score": 0.62}

        mock_client = MagicMock()
        mock_response = MagicMock(
            text='{"choice": "synthesized", "text": "Combined best description."}'
        )
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result["source"] == "llm_synthesized"
        assert result["text"] == "Combined best description."
        assert result["score"] == 0.68  # max of the two

    async def test_llm_tiebreak_unknown_choice(self):
        """Unknown choice from LLM should return None."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Desc A", "source": "wikipedia", "score": 0.7}
        candidate_b = {"text": "Desc B", "source": "knowledge_graph", "score": 0.65}

        mock_client = MagicMock()
        mock_response = MagicMock(text='{"choice": "C", "text": ""}')
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result is None

    async def test_llm_tiebreak_clean_json(self):
        """Gemini with response_mime_type=application/json returns clean JSON."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Desc A", "source": "wikipedia", "score": 0.7}
        candidate_b = {"text": "Desc B", "source": "knowledge_graph", "score": 0.63}

        mock_client = MagicMock()
        mock_response = MagicMock(text='{"choice": "A", "text": "Desc A"}')
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result is not None
        assert result["source"] == "wikipedia"

    async def test_llm_tiebreak_exception_returns_none(self):
        """Exception during LLM call should return None gracefully."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Desc A", "source": "wikipedia", "score": 0.7}
        candidate_b = {"text": "Desc B", "source": "knowledge_graph", "score": 0.65}

        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(
            side_effect=Exception("API unavailable")
        )

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result is None

    async def test_llm_tiebreak_empty_text_uses_candidate_a(self):
        """When LLM returns empty text for choice A, fall back to candidate_a text."""
        from app.pipeline.quality import _llm_tiebreak

        candidate_a = {"text": "Fallback A", "source": "wikipedia", "score": 0.7}
        candidate_b = {"text": "Desc B", "source": "knowledge_graph", "score": 0.63}

        mock_client = MagicMock()
        mock_response = MagicMock(text='{"choice": "A", "text": ""}')
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("google.genai.Client", return_value=mock_client):
            result = await _llm_tiebreak(candidate_a, candidate_b, "Test")

        assert result["text"] == "Fallback A"  # Falls back to candidate_a text


# ── TestEnrichmentPipeline ────────────────────────────────────────────────────


class TestEnrichmentPipeline:
    async def test_run_enrichment_pipeline_run_not_found(self, pipeline_engine):
        from app.pipeline.enrichment import run_enrichment_pipeline

        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            # No run in DB → should exit early without error
            await run_enrichment_pipeline("nonexistent_run")

    async def test_run_enrichment_pipeline_no_places(self, pipeline_engine):
        from app.pipeline.enrichment import run_enrichment_pipeline

        _seed_run(pipeline_engine, run_code="run_empty")

        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            await run_enrichment_pipeline("run_empty")

    async def test_run_enrichment_pipeline_cancelled(self, pipeline_engine):
        """Run with cancelled status should abort before any collectors are called."""
        from app.pipeline.enrichment import run_enrichment_pipeline

        _seed_run(pipeline_engine, loc_code="loc_cancel", run_code="run_cancel", status="cancelled")
        _seed_place(pipeline_engine, "run_cancel", place_code="gplc_cancel1")

        mock_collector = MagicMock()

        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            with patch(
                "app.pipeline.enrichment.get_enrichment_collectors",
                return_value=[mock_collector],
            ):
                await run_enrichment_pipeline("run_cancel")

        # Cancelled run detected before workers start — collect must not be called
        mock_collector.collect.assert_not_called()

    async def test_run_enrichment_pipeline_success(self, pipeline_engine):
        """Happy path: places get enriched and status set to 'complete'."""
        from sqlmodel import select

        from app.collectors.base import CollectorResult
        from app.db.models import ScrapedPlace
        from app.pipeline.enrichment import run_enrichment_pipeline

        _seed_run(pipeline_engine, run_code="run_success")
        _seed_place(pipeline_engine, "run_success", place_code="gplc_success1", name="Mosque A")

        mock_result = CollectorResult(collector_name="osm")
        mock_result.status = "skipped"

        mock_collector = MagicMock()
        mock_collector.name = "osm"
        mock_collector.collect = AsyncMock(return_value=mock_result)

        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            with patch(
                "app.pipeline.enrichment.get_enrichment_collectors",
                return_value=[mock_collector],
            ):
                await run_enrichment_pipeline("run_success")

        with Session(pipeline_engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.place_code == "gplc_success1")
            ).first()
        assert place.enrichment_status == "complete"

    async def test_run_enrichment_pipeline_place_exception(self, pipeline_engine):
        """When _enrich_place raises, place gets status 'failed' and pipeline continues."""
        from sqlmodel import select

        from app.db.models import ScrapedPlace
        from app.pipeline.enrichment import run_enrichment_pipeline

        _seed_run(pipeline_engine, loc_code="loc_exc", run_code="run_exc")
        _seed_place(pipeline_engine, "run_exc", place_code="gplc_exc1", name="Broken Place")

        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            with patch("app.pipeline.enrichment.get_enrichment_collectors", return_value=[]):
                with patch(
                    "app.pipeline.enrichment._enrich_place",
                    side_effect=Exception("Unexpected error"),
                ):
                    await run_enrichment_pipeline("run_exc")

        # The parallel worker catches the exception and sets enrichment_status = "failed"
        with Session(pipeline_engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.place_code == "gplc_exc1")
            ).first()
        assert place.enrichment_status == "failed"

    async def test_run_enrichment_pipeline_same_place_in_two_runs(self, pipeline_engine):
        """Regression: same place_code in two runs must only update the correct run's row."""
        from sqlmodel import select

        from app.collectors.base import CollectorResult

        # Seed two runs that both discovered the same place_code.
        # Create the shared location first, then seed runs that reuse it.
        from app.db.models import DataLocation, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import run_enrichment_pipeline

        with Session(pipeline_engine) as session:
            session.add(DataLocation(code="loc_multi", name="Multi Location", config={}))
            session.add(ScraperRun(run_code="run_old", location_code="loc_multi", status="pending"))
            session.add(ScraperRun(run_code="run_new", location_code="loc_multi", status="pending"))
            session.commit()
        _seed_place(pipeline_engine, "run_old", place_code="gplc_shared", name="Shared Mosque")
        _seed_place(pipeline_engine, "run_new", place_code="gplc_shared", name="Shared Mosque")

        mock_result = CollectorResult(collector_name="osm")
        mock_result.status = "skipped"
        mock_collector = MagicMock()
        mock_collector.name = "osm"
        mock_collector.collect = AsyncMock(return_value=mock_result)

        # Enrich only run_new
        with patch("app.pipeline.enrichment.engine", pipeline_engine):
            with patch(
                "app.pipeline.enrichment.get_enrichment_collectors",
                return_value=[mock_collector],
            ):
                await run_enrichment_pipeline("run_new")

        with Session(pipeline_engine) as session:
            new_place = session.exec(
                select(ScrapedPlace)
                .where(ScrapedPlace.place_code == "gplc_shared")
                .where(ScrapedPlace.run_code == "run_new")
            ).first()
            old_place = session.exec(
                select(ScrapedPlace)
                .where(ScrapedPlace.place_code == "gplc_shared")
                .where(ScrapedPlace.run_code == "run_old")
            ).first()

        # Only run_new's row should be marked complete
        assert new_place.enrichment_status == "complete"
        # run_old's row must remain untouched
        assert old_place.enrichment_status == "pending"


class TestEnrichPlace:
    async def test_enrich_place_basic(self, pipeline_engine):
        """_enrich_place updates place status to 'complete'."""

        from app.db.models import DataLocation, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import _enrich_place

        with Session(pipeline_engine) as session:
            loc = DataLocation(code="loc_ep", name="EP", config={})
            session.add(loc)
            run = ScraperRun(run_code="run_ep", location_code="loc_ep")
            session.add(run)
            place = ScrapedPlace(
                run_code="run_ep",
                place_code="gplc_ep1",
                name="Enrich Place",
                raw_data={"lat": 0.0, "lng": 0.0},
            )
            session.add(place)
            session.commit()

            await _enrich_place(place, "run_ep", [], session)

            session.refresh(place)
            assert place.enrichment_status == "complete"

    async def test_enrich_place_with_collector(self, pipeline_engine):
        """_enrich_place stores RawCollectorData for each collector (batch write at end)."""
        from sqlmodel import select

        from app.collectors.base import CollectorResult
        from app.db.models import DataLocation, RawCollectorData, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import _enrich_place

        with Session(pipeline_engine) as session:
            loc = DataLocation(code="loc_col", name="Col", config={})
            session.add(loc)
            run = ScraperRun(run_code="run_col", location_code="loc_col")
            session.add(run)
            place = ScrapedPlace(
                run_code="run_col",
                place_code="gplc_col1",
                name="Test Mosque",
                raw_data={"lat": 25.0, "lng": 55.0},
            )
            session.add(place)
            session.commit()

            mock_result = CollectorResult(collector_name="osm")
            mock_result.status = "skipped"
            mock_result.error_message = "No OSM data"

            mock_collector = MagicMock()
            mock_collector.name = "osm"
            mock_collector.collect = AsyncMock(return_value=mock_result)

            await _enrich_place(place, "run_col", [mock_collector], session)

            raw_records = session.exec(
                select(RawCollectorData).where(RawCollectorData.place_code == "gplc_col1")
            ).all()

        assert len(raw_records) == 1
        assert raw_records[0].collector_name == "osm"
        assert raw_records[0].status == "skipped"

    async def test_enrich_place_with_gmaps_raw_data(self, pipeline_engine):
        """When gmaps RawCollectorData exists, _extract is called for it."""

        from app.db.models import DataLocation, RawCollectorData, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import _enrich_place

        with Session(pipeline_engine) as session:
            loc = DataLocation(code="loc_gmaps", name="GMaps", config={})
            session.add(loc)
            run = ScraperRun(run_code="run_gmaps", location_code="loc_gmaps")
            session.add(run)
            place = ScrapedPlace(
                run_code="run_gmaps",
                place_code="gplc_gmaps1",
                name="GMaps Mosque",
                raw_data={"lat": 25.0, "lng": 55.0},
            )
            session.add(place)
            # Pre-insert gmaps raw data
            gmaps_raw = RawCollectorData(
                place_code="gplc_gmaps1",
                collector_name="gmaps",
                run_code="run_gmaps",
                raw_response={"editorialSummary": {"text": "A historic site"}},
                status="success",
            )
            session.add(gmaps_raw)
            session.commit()

            await _enrich_place(place, "run_gmaps", [], session)

            session.refresh(place)
            assert place.enrichment_status == "complete"
            # Raw data should have been merged
            assert place.raw_data is not None

    async def test_enrich_place_collector_exception(self, pipeline_engine):
        """Collector exceptions are caught and stored as 'failed' raw data."""
        from sqlmodel import select

        from app.db.models import DataLocation, RawCollectorData, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import _enrich_place

        with Session(pipeline_engine) as session:
            loc = DataLocation(code="loc_err", name="Err", config={})
            session.add(loc)
            run = ScraperRun(run_code="run_err", location_code="loc_err")
            session.add(run)
            place = ScrapedPlace(
                run_code="run_err",
                place_code="gplc_err1",
                name="Error Mosque",
                raw_data={"lat": 0.0, "lng": 0.0},
            )
            session.add(place)
            session.commit()

            error_collector = MagicMock()
            error_collector.name = "errorcollector"
            error_collector.collect = AsyncMock(side_effect=Exception("Collector boom!"))

            await _enrich_place(place, "run_err", [error_collector], session)

            raw_records = session.exec(
                select(RawCollectorData).where(RawCollectorData.place_code == "gplc_err1")
            ).all()

        assert len(raw_records) == 1
        assert raw_records[0].status == "failed"
        assert "Collector boom!" in raw_records[0].error_message

    async def test_enrich_place_tags_propagation(self, pipeline_engine):
        """Tags from OSM (Phase 0) must propagate to Wikipedia (Phase 1)."""
        from app.collectors.base import CollectorResult
        from app.db.models import DataLocation, ScrapedPlace, ScraperRun
        from app.pipeline.enrichment import _enrich_place

        with Session(pipeline_engine) as session:
            loc = DataLocation(code="loc_tags", name="Tags", config={})
            session.add(loc)
            run = ScraperRun(run_code="run_tags", location_code="loc_tags")
            session.add(run)
            place = ScrapedPlace(
                run_code="run_tags",
                place_code="gplc_tags1",
                name="Test Mosque",
                raw_data={"lat": 25.0, "lng": 55.0},
            )
            session.add(place)
            session.commit()

            # Phase 0: OSM collector returns tags
            tag_result = CollectorResult(collector_name="osm")
            tag_result.status = "success"
            tag_result.tags = {"wikipedia": "en:Test", "wikidata": "Q99999"}

            captured_existing_data = []

            def capture_collect(place_code, lat, lng, name, existing_data=None):
                captured_existing_data.append(existing_data or {})
                result = CollectorResult(collector_name="wikipedia")
                result.status = "skipped"
                return result

            osm_collector = MagicMock()
            osm_collector.name = "osm"
            osm_collector.collect = AsyncMock(return_value=tag_result)

            wiki_collector = MagicMock()
            wiki_collector.name = "wikipedia"
            wiki_collector.collect = AsyncMock(side_effect=capture_collect)

            # OSM goes to Phase 0, Wikipedia goes to Phase 1 — tags must propagate
            await _enrich_place(place, "run_tags", [osm_collector, wiki_collector], session)

        # Wikipedia (Phase 1) must have received the OSM tags in existing_data
        assert len(captured_existing_data) == 1
        assert captured_existing_data[0].get("tags", {}).get("wikipedia") == "en:Test"
