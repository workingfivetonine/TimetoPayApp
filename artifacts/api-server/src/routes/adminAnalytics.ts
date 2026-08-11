import { Router } from "express";
import { requireAdmin } from "../middlewares/auth";
import { listChartSources, computeCustomChart, listFieldValues } from "../lib/customAnalytics";

const router = Router();

router.use(requireAdmin);

// The whitelist of sources/fields the picker UI is built from. Nothing here is
// ever taken from the client and turned into SQL — see customAnalytics.ts.
router.get("/custom-chart/meta", (_req, res): void => {
  res.json({ sources: listChartSources() });
});

// Distinct values for one category field, to populate a filter dropdown (e.g.
// every store name, every country actually present).
router.get("/custom-chart/field-values", async (req, res): Promise<void> => {
  const { source, field } = req.query as Record<string, string | undefined>;
  if (!source || !field) {
    res.status(400).json({ error: "source and field are required" });
    return;
  }
  const result = await listFieldValues(source, field);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get("/custom-chart", async (req, res): Promise<void> => {
  const { source, groupBy, granularity, splitBy, aggregation, measure, filters } = req.query as Record<
    string,
    string | undefined
  >;

  if (!source || !groupBy || !aggregation) {
    res.status(400).json({ error: "source, groupBy and aggregation are required" });
    return;
  }

  // `filters` arrives as a single JSON-encoded object ({field: [values]})
  // rather than one query param per field — simpler to serialize correctly
  // from the client than a repeated/bracketed query-param convention, for a
  // value that never needs to be human-typed into the URL.
  let parsedFilters: Record<string, string[]> | undefined;
  if (filters) {
    try {
      const parsed = JSON.parse(filters);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((v) => !Array.isArray(v) || v.some((x) => typeof x !== "string"))
      ) {
        throw new Error("not a flat object of string arrays");
      }
      parsedFilters = parsed;
    } catch {
      res.status(400).json({ error: "filters must be a JSON object of field -> array of value strings" });
      return;
    }
  }

  const result = await computeCustomChart({
    source,
    groupBy,
    granularity,
    splitBy,
    aggregation,
    measure,
    filters: parsedFilters,
  });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

export default router;
