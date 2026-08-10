import { IsInt, Min } from 'class-validator';

export class PeerOnboardingConfigDto {
  @IsInt()
  @Min(1)
  onboardingValidationTimeoutMs!: number;
}
