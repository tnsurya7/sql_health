# SQLSense AI - Testing Guide

SQLSense AI includes deterministic unit and integration test suites covering all core algorithmic, parsing, transformation, validation, and ML components without relying on external network dependencies.

## Running Tests

### 1. Run Complete Workspace Test Suite
```bash
npm test
```
Runs both backend Jest algorithm tests and frontend Vitest store/UI tests.

### 2. Run Backend Algorithm Tests
```bash
npm run test --workspace=backend
```

### 3. Run Frontend Unit Tests
```bash
npm run test --workspace=frontend
```

## Test Coverage Summary

- **Dialect Detection**: PostgreSQL, MySQL, Oracle, SQL Server dialect matching.
- **AST Parsing & DFS**: Recursive traversal, expression metrics, node counts, DML classification.
- **Normalization & Fingerprinting**: Parameter stripping, canonical keyword formatting, SHA-256 hash stability across varying literals.
- **Rule-Based Engine**: 25 deterministic anti-pattern checks (R001 to R025) including sargability, wildcard projection, missing indexes, and unconstrained DML.
- **Schema Graph BFS**: Foreign key dependency pathfinding between disparate entities.
- **Plan Analyzer & Cardinality**: $100\times$ discrepancy flagging on stale row estimates.
- **Index Advisor**: Composite column ordering (equality before range/sort) and deduplication against existing indexes.
- **Relational Algebra**: Constant folding, redundant predicate simplification ($1=1$), subquery unnesting.
- **DP Join Optimizer**: Multi-table subset cost exploration ($DP[subset]$).
- **Candidate Validation**: Syntax validation, semantic coverage, destructive DDL blocking.
- **Time-Series & ML**: SMA, EMA, Z-Score spike detection ($|Z| \ge 2.5$), and Isolation Forest sample threshold enforcement.
- **Deadlock Detector**: Wait-for graph cycle detection ($A \rightarrow B \rightarrow A$) and acyclic validation.
- **Deterministic Health Score**: 5-dimension weighted score verification.
- **Gemini Structured Validation**: Strict Zod schema compliance checking.
