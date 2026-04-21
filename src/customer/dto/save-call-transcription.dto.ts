import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveCallTranscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  callSid: string;

  @IsString()
  @IsNotEmpty()
  transcript: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  utterances?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  recordingUrl?: string;
}
