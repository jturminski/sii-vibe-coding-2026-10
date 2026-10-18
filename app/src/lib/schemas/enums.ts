import { z } from "zod";
import { CASE_TYPES, CATEGORIES, DECISION_STATUSES, type CaseType, type Category, type DecisionStatus } from "@/lib/domain";
import { ERROR_CODES } from "./error-codes";

const keys = <K extends string>(record: Record<K, unknown>) => Object.keys(record) as [K, ...K[]];

/** Enum schema whose missing/empty input reports REQUIRED and any other invalid value INVALID_ENUM. */
const codedEnum = <K extends string>(values: [K, ...K[]]) =>
  z.enum(values, {
    error: (issue) =>
      issue.input === undefined || issue.input === null || issue.input === ""
        ? ERROR_CODES.REQUIRED
        : ERROR_CODES.INVALID_ENUM,
  });

export const caseTypeSchema = codedEnum<CaseType>(keys(CASE_TYPES));
export const categorySchema = codedEnum<Category>(keys(CATEGORIES));
export const decisionStatusSchema = codedEnum<DecisionStatus>(keys(DECISION_STATUSES));
