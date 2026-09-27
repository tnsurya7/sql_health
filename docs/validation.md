# SQLSense AI - Validation Pipeline

SQLSense AI enforces a strict multi-tier validation pipeline ensuring that no AI-generated or algorithmic query candidate is recommended without deterministic proof of correctness, safety, and performance.

## The 7 Validation Stages

| Stage | Name | Method | Failure Action |
|-------|------|--------|----------------|
| 1 | **Syntax Validation** | Deterministic dialect tokenizer and AST parsing | Candidate rejected immediately |
| 2 | **Safety Validation** | Blacklist detection for unconstrained `UPDATE`/`DELETE`, `DROP`, `TRUNCATE`, `ALTER` | Flagged as CRITICAL risk, blocked from auto-benchmarking |
| 3 | **Semantic Validation** | Table signature and projection coverage comparison | Flagged as semantically diverging if original tables are omitted |
| 4 | **Schema Validation** | Catalog lookup against target database metadata | Rejected if hallucinated tables/columns are referenced |
| 5 | **EXPLAIN Validation** | `EXPLAIN (FORMAT JSON)` dry-run on target database | Rejected if planner rejects candidate syntax or types |
| 6 | **Cost Comparison** | Compares `TotalCost(Candidate)` vs `TotalCost(Original)` | Deprioritized if candidate does not demonstrate lower estimated cost |
| 7 | **Safe Benchmarking** | Executes only safe `SELECT` statements with statement timeouts and warm-up runs | Discarded if latency regresses |
