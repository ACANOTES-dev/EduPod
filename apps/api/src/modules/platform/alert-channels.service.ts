import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAlertChannel, type PlatformAlertChannelType } from '@prisma/client';
import { z } from 'zod';

import {
  createAlertChannelSchema,
  emailAlertChannelConfigSchema,
  pushAlertChannelConfigSchema,
  type CreateAlertChannelDto,
  type EmailAlertChannelConfig,
  type UpdateAlertChannelDto,
  type WhatsAppAlertChannelConfig,
  whatsappAlertChannelConfigSchema,
} from '@school/shared';

import { EncryptionService } from '../configuration/encryption.service';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { ChannelDispatchService } from './channel-dispatch.service';

type MaskedTelegramConfig = {
  bot_token_mask: string;
  chat_id: string;
};

type MaskedPushConfig = {
  endpoint: string;
  keys: {
    auth_mask: string;
    p256dh_mask: string;
  };
};

export type AlertChannelResponse = Omit<PlatformAlertChannel, 'config'> & {
  config:
    | EmailAlertChannelConfig
    | MaskedTelegramConfig
    | WhatsAppAlertChannelConfig
    | MaskedPushConfig;
};

const storedTelegramConfigSchema = z.object({
  bot_token_encrypted: z.string().min(1),
  bot_token_key_ref: z.string().min(1),
  bot_token_mask: z.string().min(1),
  chat_id: z.string().min(1),
});

const updateTelegramConfigSchema = z.object({
  bot_token: z.string().trim().min(1).optional(),
  chat_id: z.string().trim().min(1).max(255).optional(),
});

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AlertChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: ChannelDispatchService,
    private readonly encryption: EncryptionService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async listChannels(): Promise<AlertChannelResponse[]> {
    const channels = await this.prisma.platformAlertChannel.findMany({
      orderBy: { created_at: 'desc' },
    });
    return channels.map((channel) => this.toResponse(channel));
  }

  async createChannel(
    dto: CreateAlertChannelDto,
    audit?: PlatformAuditContext,
  ): Promise<AlertChannelResponse> {
    const validated = this.parseCreate(dto);
    const created = await this.prisma.platformAlertChannel.create({
      data: {
        config: this.prepareCreateConfig(validated),
        is_enabled: validated.is_enabled,
        name: validated.name,
        type: validated.type,
      },
    });

    const response = this.toResponse(created);
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_channel_created',
        target_resource_id: created.id,
        target_resource_type: 'alert_channel',
        payload: { after: response },
      });
    }
    return response;
  }

  async updateChannel(
    id: string,
    dto: UpdateAlertChannelDto,
    audit?: PlatformAuditContext,
  ): Promise<AlertChannelResponse> {
    const existing = await this.findOrThrow(id);
    const data: Prisma.PlatformAlertChannelUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.is_enabled !== undefined) data.is_enabled = dto.is_enabled;
    if (dto.config !== undefined) {
      data.config = this.prepareUpdateConfig(existing.type, dto.config, existing.config);
    }

    if (Object.keys(data).length === 0) {
      return this.toResponse(existing);
    }

    const updated = await this.prisma.platformAlertChannel.update({
      where: { id },
      data,
    });
    const before = this.toResponse(existing);
    const after = this.toResponse(updated);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_channel_updated',
        target_resource_id: id,
        target_resource_type: 'alert_channel',
        payload: { before, after },
      });
    }
    return after;
  }

  async deleteChannel(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.findOrThrow(id);
    await this.prisma.platformAlertChannel.delete({ where: { id } });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_channel_deleted',
        target_resource_id: id,
        target_resource_type: 'alert_channel',
        payload: { before: this.toResponse(existing) },
      });
    }
  }

  async testChannel(
    id: string,
    audit?: PlatformAuditContext,
  ): Promise<{ success: boolean; message: string }> {
    const channel = await this.findOrThrow(id);
    const result = await this.dispatchService.sendTestAlert(channel);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'alert_channel_tested',
        target_resource_id: id,
        target_resource_type: 'alert_channel',
        payload: { after: { channel: this.toResponse(channel), result } },
      });
    }

    return result;
  }

  private async findOrThrow(id: string): Promise<PlatformAlertChannel> {
    const channel = await this.prisma.platformAlertChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException({
        code: 'ALERT_CHANNEL_NOT_FOUND',
        message: `Alert channel with id "${id}" not found`,
      });
    }
    return channel;
  }

  private parseCreate(dto: CreateAlertChannelDto): CreateAlertChannelDto {
    const parsed = createAlertChannelSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_ALERT_CHANNEL_CONFIG',
        message: 'Alert channel configuration is invalid.',
        details: parsed.error.flatten(),
      });
    }
    return parsed.data;
  }

  private prepareCreateConfig(dto: CreateAlertChannelDto): Prisma.InputJsonValue {
    if (dto.type === 'telegram') {
      const { encrypted, keyRef } = this.encryption.encrypt(dto.config.bot_token);
      return toJson({
        bot_token_encrypted: encrypted,
        bot_token_key_ref: keyRef,
        bot_token_mask: this.encryption.mask(dto.config.bot_token),
        chat_id: dto.config.chat_id,
      });
    }
    return toJson(dto.config);
  }

  private prepareUpdateConfig(
    type: PlatformAlertChannelType,
    config: Record<string, unknown>,
    existingConfig: unknown,
  ): Prisma.InputJsonValue {
    try {
      switch (type) {
        case 'email':
          return toJson(emailAlertChannelConfigSchema.parse(config));
        case 'push':
          return toJson(pushAlertChannelConfigSchema.parse(config));
        case 'telegram':
          return this.prepareTelegramUpdateConfig(config, existingConfig);
        case 'whatsapp':
          return toJson(whatsappAlertChannelConfigSchema.parse(config));
      }
      throw new BadRequestException({
        code: 'INVALID_ALERT_CHANNEL_TYPE',
        message: `Unsupported alert channel type "${type}"`,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        throw new BadRequestException({
          code: 'INVALID_ALERT_CHANNEL_CONFIG',
          message: 'Alert channel configuration is invalid.',
          details: err.flatten(),
        });
      }
      throw err;
    }
  }

  private prepareTelegramUpdateConfig(
    config: Record<string, unknown>,
    existingConfig: unknown,
  ): Prisma.InputJsonValue {
    const input = updateTelegramConfigSchema.parse(config);
    const existing = storedTelegramConfigSchema.parse(existingConfig);

    if (input.bot_token) {
      const { encrypted, keyRef } = this.encryption.encrypt(input.bot_token);
      return toJson({
        bot_token_encrypted: encrypted,
        bot_token_key_ref: keyRef,
        bot_token_mask: this.encryption.mask(input.bot_token),
        chat_id: input.chat_id ?? existing.chat_id,
      });
    }

    return toJson({
      bot_token_encrypted: existing.bot_token_encrypted,
      bot_token_key_ref: existing.bot_token_key_ref,
      bot_token_mask: existing.bot_token_mask,
      chat_id: input.chat_id ?? existing.chat_id,
    });
  }

  private toResponse(channel: PlatformAlertChannel): AlertChannelResponse {
    return {
      ...channel,
      config: this.maskConfig(channel.type, channel.config),
    };
  }

  private maskConfig(
    type: PlatformAlertChannelType,
    config: unknown,
  ): AlertChannelResponse['config'] {
    switch (type) {
      case 'email':
        return emailAlertChannelConfigSchema.parse(config);
      case 'push': {
        const parsed = pushAlertChannelConfigSchema.parse(config);
        return {
          endpoint: parsed.endpoint,
          keys: {
            auth_mask: this.encryption.mask(parsed.keys.auth),
            p256dh_mask: this.encryption.mask(parsed.keys.p256dh),
          },
        };
      }
      case 'telegram': {
        const parsed = storedTelegramConfigSchema.parse(config);
        return {
          bot_token_mask: parsed.bot_token_mask,
          chat_id: parsed.chat_id,
        };
      }
      case 'whatsapp':
        return whatsappAlertChannelConfigSchema.parse(config);
    }
  }
}
