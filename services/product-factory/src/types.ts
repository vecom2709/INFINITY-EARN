import type { JsonSchema } from '../../../packages/contracts/src/schemas.ts';

export interface QaCheckResult {
  check: string;
  passed: boolean;
  detail?: string;
}

/** Produkt-Plugin-Vertrag (Masterprompt §5). */
export interface ProductCapability {
  capability_id: string;
  version: number;
  inputs_schema: JsonSchema;
  output_schema: { media_type: string; extension: string };
  licensing_requirements: string;
  required_tools: readonly string[];
  estimated_duration_minutes: number;
  max_complexity: number;
  qa_suite: readonly string[];
  supported_languages: readonly string[];
  data_privacy: string;
  artifact_storage: string;
  refund_criteria: string;
  disabled_reason: string | null;
  owner: string;
  estimatedCostMinor(input: unknown): number;
  complexity(input: unknown): number;
  generate(input: unknown): Uint8Array;
  /** Gesetzt, wenn das Produkt nicht im Worker entstehen kann (z. B. Windows-Programm): Bau durch einen externen Bau-Agenten. */
  externalBuild?: { platform: 'windows'; spec(input: unknown): unknown };
  runQa(bytes: Uint8Array, input: unknown): QaCheckResult[];
}
