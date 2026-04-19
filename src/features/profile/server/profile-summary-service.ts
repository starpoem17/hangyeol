import type { MyProfileSummary } from "../api";
import {
  getProfileSummaryWithDependencies as getProfileSummaryCoreWithDependencies,
  type GetProfileSummaryDependencies,
} from "../../../../shared/profile/profile-summary-core";

export type { GetProfileSummaryDependencies };

export async function getProfileSummaryWithDependencies(
  authUserId: string,
  dependencies: GetProfileSummaryDependencies,
): Promise<MyProfileSummary | null> {
  return getProfileSummaryCoreWithDependencies(authUserId, dependencies);
}
