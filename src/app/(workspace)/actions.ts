"use server";
import { revalidatePath } from "next/cache";
import { executeCommand } from "@/lib/server/services";
import type { CommandName } from "@/lib/domain/commands";
export async function runCommand(
  operation: CommandName,
  input: unknown,
  key: string,
) {
  const result = await executeCommand(operation, input, key);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
