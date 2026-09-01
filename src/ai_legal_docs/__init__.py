"""Deterministic DOCX generation from structured data."""

from .orchestrator import PipelineResult, PipelineStatus, run_pipeline

__all__ = ["PipelineResult", "PipelineStatus", "run_pipeline"]
