import "server-only";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import {
  adminCommands,
  commandSchemas,
  type ActionResult,
  type CommandName,
  type CommandResult,
} from "@/lib/domain/commands";
import { errors } from "@/lib/domain/i18n";
export async function executeCommand(
  operation: CommandName,
  input: unknown,
  key: string,
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (
    typeof operation !== "string" ||
    !Object.hasOwn(commandSchemas, operation)
  )
    return { ok: false, code: "UNKNOWN_COMMAND", message: "未知操作" };
  if (adminCommands.has(operation) && staff.role !== "admin")
    return { ok: false, code: "FORBIDDEN", message: errors.FORBIDDEN };
  try {
    z.uuid().parse(key);
    const parsed = commandSchemas[operation].parse(input);
    const { data, error } = await (
      await supabaseServer()
    ).rpc("gym_command", {
      p_operation: operation,
      p_input: parsed,
      p_key: key,
    });
    if (error) {
      const code =
        Object.keys(errors).find((k) => error.message.includes(k)) ||
        "DATABASE_ERROR";
      return {
        ok: false,
        code,
        message:
          errors[code] ||
          "操作未完成，資料沒有變更。請檢查欄位、權限及資料狀態後重試。",
      };
    }
    return { ok: true, data: data as CommandResult };
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("；"),
      };
    throw e;
  }
}
