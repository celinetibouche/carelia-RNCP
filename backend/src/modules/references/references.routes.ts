import { Router } from "express";
import { asyncHandler } from "../shared/http-utils.js";
import { selectRows } from "../shared/repository-utils.js";

export const referencesRouter = Router();

referencesRouter.get("/", asyncHandler(async (_request, response) => {
  const [roles, napQualities, moods, diaperChangeTypes] = await Promise.all([
    selectRows("SELECT role_id AS roleId, label FROM roles ORDER BY role_id"),
    selectRows("SELECT nap_quality_id AS napQualityId, label FROM nap_qualities ORDER BY nap_quality_id"),
    selectRows("SELECT mood_id AS moodId, label FROM moods ORDER BY mood_id"),
    selectRows("SELECT diaper_change_type_id AS diaperChangeTypeId, label FROM diaper_change_types ORDER BY diaper_change_type_id")
  ]);
  response.json({ roles, napQualities, moods, diaperChangeTypes });
}));
