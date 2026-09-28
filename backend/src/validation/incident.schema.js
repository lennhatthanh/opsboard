import { z } from "zod";

const optionalText = z.string().trim().max(2000).optional().nullable();

export const incidentInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: optionalText,
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]),
  status: z.enum(["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED"]).default("OPEN"),
  serviceId: z.coerce.number().int().positive(),
  assignee: z.string().trim().max(100).optional().nullable(),
});

export const incidentUpdateSchema = incidentInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

