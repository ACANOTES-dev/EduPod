import { resolve } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { envValidation } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', resolve(process.cwd(), '.env')],
      validate: envValidation,
    }),
  ],
})
export class ConfigModule {}
