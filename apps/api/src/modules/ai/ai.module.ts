import { Module } from '@nestjs/common';

import { AnthropicClientService } from './anthropic-client.service';

@Module({
  providers: [AnthropicClientService],
  exports: [AnthropicClientService],
})
export class AiModule {}
