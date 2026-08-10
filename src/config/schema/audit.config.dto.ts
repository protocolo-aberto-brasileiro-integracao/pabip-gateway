import { IsIn, IsInt, Min } from 'class-validator';

export const AUDIT_SINKS = ['stdout', 'db'] as const;
export type AuditSink = (typeof AUDIT_SINKS)[number];

export class AuditConfigDto {
  @IsIn(AUDIT_SINKS)
  sink!: AuditSink;

  @IsInt()
  @Min(180)
  retentionDays!: number;
}
