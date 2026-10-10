import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RootDatabase } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { today } from "@/lib/time";
import type { Generate, Usage } from "./provider";
export const maxOutputTokens = 6000;
export function budgetConfig() {
  const numeric = (key: string) => {
    const value = process.env[key];
    if (
      value === undefined ||
      !value.trim() ||
      !Number.isFinite(Number(value)) ||
      Number(value) < 0
    )
      throw new AppError(
        503,
        "AI maliyet fiyatları ve günlük bütçe yapılandırılmadı.",
        "AI_COST_NOT_CONFIGURED",
      );
    return Number(value);
  };
  const daily = numeric("AI_DAILY_BUDGET_USD"),
    input = numeric("AI_INPUT_USD_PER_MILLION"),
    output = numeric("AI_OUTPUT_USD_PER_MILLION");
  if (daily <= 0)
    throw new AppError(503, "AI günlük bütçesi pozitif olmalı.", "AI_COST_NOT_CONFIGURED");
  return { daily, input, output };
}
export function estimatedRequestCost(
  schema: z.ZodType,
  instructions: string,
  input: unknown,
  rates: { input: number; output: number },
) {
  // Text-only calls: conservative UTF-8 byte bound, including schema and framing allowance.
  const bytes =
    Buffer.byteLength(
      JSON.stringify({ input, instructions, schema: z.toJSONSchema(schema) }),
      "utf8",
    ) + 2048;
  if (bytes > 500_000) throw new AppError(413, "AI kaynak bağlamı çok büyük. Daha az belge seç.");
  return (bytes * rates.input + maxOutputTokens * rates.output) / 1_000_000;
}
export async function reserveRequest(
  db: RootDatabase,
  scope: { course_id: string; job_id: string },
  phase: string,
  cost: number,
  rates: ReturnType<typeof budgetConfig>,
) {
  const id = randomUUID(),
    day = today();
  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`ai-budget:${day}`]);
    const [spent] = await tx.query<{ total: string }>(
      "select coalesce(sum(case when status='settled' then actual_usd else reserved_usd end),0)::text total from ai_cost_requests where day=$1",
      [day],
    );
    if (Number(spent.total) + cost > rates.daily)
      throw new AppError(
        429,
        "AI günlük maliyet bütçesine ulaşıldı. İşlem yarın yeniden denenecek.",
        "AI_DAILY_BUDGET_EXCEEDED",
      );
    await tx.query(
      "insert into ai_cost_requests(id,course_id,job_id,model,phase,day,status,reserved_usd,input_rate,output_rate) values($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$9)",
      [
        id,
        scope.course_id,
        scope.job_id,
        process.env.AI_MODEL || "configured-provider",
        phase,
        day,
        cost,
        rates.input,
        rates.output,
      ],
    );
  });
  return id;
}
export function budgetedGenerate(
  db: RootDatabase,
  scope: { course_id: string; job_id: string },
  provider: Generate,
): Generate {
  return async (name, schema, instructions, input) => {
    const rates = budgetConfig(),
      cost = estimatedRequestCost(schema, instructions, input, rates),
      id = await reserveRequest(db, scope, name, cost, rates);
    let settled = false;
    const observe = async (usage: Usage, model: string) => {
      if (settled) return;
      const parsed = z
        .object({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
        })
        .safeParse(usage);
      if (!parsed.success || parsed.data.input_tokens + parsed.data.output_tokens === 0) return;
      const actual =
        (parsed.data.input_tokens * rates.input + parsed.data.output_tokens * rates.output) /
        1_000_000;
      await db.transaction(async (tx) => {
        await tx.query(
          "update ai_cost_requests set status='settled',actual_usd=$2,model=$3,settled_at=now() where id=$1 and status!='settled'",
          [id, actual, model],
        );
        await tx.query(
          "insert into ai_usage(course_id,job_id,model,input_tokens,output_tokens,estimated_cost_usd,request_id) values($1,$2,$3,$4,$5,$6,$7) on conflict(request_id) do nothing",
          [
            scope.course_id,
            scope.job_id,
            model,
            parsed.data.input_tokens,
            parsed.data.output_tokens,
            actual,
            id,
          ],
        );
      });
      settled = true;
    };
    try {
      const result = await provider(name, schema, instructions, input, observe);
      if (!settled) await observe(result, result.model);
      return result;
    } finally {
      // A timeout may still have incurred a provider charge. Keep its reservation.
      if (!settled)
        await db.query(
          "update ai_cost_requests set status='unknown' where id=$1 and status='reserved'",
          [id],
        );
    }
  };
}
