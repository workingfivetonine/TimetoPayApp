import { Router } from "express";
import { requireAdmin } from "../middlewares/auth";
import { listChartSources, computeCustomChart } from "../lib/customAnalytics";

const router = Router();

router.use(requireAdmin);

// The whitelist of sources/fields the picker UI is built from. Nothing here is
// ever taken from the client and turned into SQL — see customAnalytics.ts.
router.get("/custom-chart/meta", (_req, res): void => {
  res.json({ sources: listChartSources() });
});

router.get("/custom-chart", async (req, res): Promise<void> => {
  const { source, groupBy, granularity, splitBy, aggregation, measure } = req.query as Record<
    string,
    string | undefined
  >;

  if (!source || !groupBy || !aggregation) {
    res.status(400).json({ error: "source, groupBy and aggregation are required" });
    return;
  }

  const result = await computeCustomChart({ source, groupBy, granularity, splitBy, aggregation, measure });
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

export default router;
