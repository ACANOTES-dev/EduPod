# Session 1A: WebSocket Infrastructure + Redis Pub/Sub

**Depends on:** Nothing (first session)
**Unlocks:** 1B, 1C, 1D (all subsequent sessions consume the WS infrastructure)

---

## Objective

Build the real-time communication layer that powers the entire platform admin dashboard. This session creates:

1. A NestJS WebSocket gateway using Socket.IO with JWT-authenticated handshake
2. A Redis pub/sub service that bridges backend events to connected WebSocket clients
3. A frontend Socket.IO client with connection management, auto-reconnect, and a React hook for components to subscribe to channels

After this session, any backend service can publish a message to a Redis channel and have it delivered to all authenticated platform admin clients in real-time.

---

## Architecture

```
Browser (Socket.IO client)
    | WSS connection (JWT in handshake auth)
    v
NestJS PlatformGateway (@WebSocketGateway)
    | Subscribes to Redis channels on client connect
    v
RedisPubSubService
    | Wraps ioredis subscriber client (dedicated connection)
    v
Redis Pub/Sub channels:
    platform:health      -- health check state changes
    platform:alerts      -- new/resolved alerts
    platform:queues      -- queue depth, failures, stuck jobs (Layer 2)
    platform:activity    -- platform-level activity feed (Layer 3)
    platform:onboarding  -- onboarding step completions
```

**Event flow:**

1. A backend service (e.g., HealthService) calls `redisPubSub.publish('platform:health', payload)`
2. The RedisPubSubService publishes to the Redis channel
3. The PlatformGateway's Redis subscriber receives the message
4. The gateway broadcasts to all authenticated Socket.IO clients in the `platform` room
5. The frontend hook fires callbacks for that channel

---

## Backend Changes

### 1. Install Dependencies

```bash
# In apps/api
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

### 2. New Module: `apps/api/src/modules/platform/`

This is a new NestJS module dedicated to platform-level WebSocket and real-time infrastructure. It is separate from `tenants/` because it will grow to house all platform-admin-specific services across Layers 1-3.

### 3. Files to Create

#### `apps/api/src/modules/platform/platform.module.ts`

```typescript
@Module({
  imports: [AuthModule],
  providers: [RedisPubSubService, PlatformGateway],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
```

- Imports `AuthModule` for JWT verification in the WebSocket handshake
- Exports `RedisPubSubService` so other modules (Health, Alerts) can publish events

#### `apps/api/src/modules/platform/redis-pubsub.service.ts`

**Class:** `RedisPubSubService implements OnModuleInit, OnModuleDestroy`

**Constructor DI:**

- `private readonly configService: ConfigService`

**Key behaviours:**

- Creates a **dedicated** Redis connection for subscribing (separate from the main RedisService client -- required by ioredis for pub/sub)
- Creates a second Redis connection for publishing
- Maintains a Map of channel -> Set of callback functions

**Methods:**

```typescript
// Publish a message to a Redis channel
async publish(channel: string, payload: Record<string, unknown>): Promise<void>

// Subscribe to a Redis channel with a callback
subscribe(channel: string, callback: (message: Record<string, unknown>) => void): void

// Unsubscribe from a Redis channel
unsubscribe(channel: string, callback: (message: Record<string, unknown>) => void): void

// Lifecycle: connect both Redis clients
async onModuleInit(): Promise<void>

// Lifecycle: disconnect both Redis clients
async onModuleDestroy(): Promise<void>
```

**Implementation notes:**

- The subscriber Redis client calls `client.subscribe(channel)` and listens on the `'message'` event
- Messages are JSON-stringified on publish and JSON-parsed on receive
- The publisher client is a standard ioredis instance (reusing the REDIS_URL config)
- Log all subscribe/unsubscribe/publish operations at debug level

#### `apps/api/src/modules/platform/platform.gateway.ts`

**Class:** `PlatformGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect`

**Decorator:**

```typescript
@WebSocketGateway({
  namespace: '/platform',
  cors: {
    origin: true,
    credentials: true,
  },
})
```

**Constructor DI:**

- `private readonly redisPubSub: RedisPubSubService`
- `private readonly configService: ConfigService`
- `private readonly redis: RedisService`
- `private readonly prisma: PrismaService`

**Key behaviours:**

1. **`afterInit(server: Server)`**: Subscribe to all platform Redis channels. For each channel, the callback broadcasts the parsed message to all clients in the `'platform-admins'` room.

2. **`handleConnection(client: Socket)`**: Extract JWT from `client.handshake.auth.token`. Verify the JWT signature using the same secret as the AuthGuard (`JWT_SECRET` from ConfigService). Verify the user is a platform owner by checking the `platform_owner_user_ids` Redis set (same logic as `PlatformOwnerGuard`). If valid, join the client to the `'platform-admins'` room and store `userId` on `client.data`. If invalid, call `client.disconnect(true)`.

3. **`handleDisconnect(client: Socket)`**: Log disconnection. No cleanup needed -- Socket.IO auto-removes from rooms.

**Redis channels subscribed:**

- `platform:health`
- `platform:alerts`
- `platform:onboarding`

**Socket.IO events emitted to clients:**

- `health:update` (from `platform:health`)
- `alert:new` (from `platform:alerts`)
- `onboarding:update` (from `platform:onboarding`)

**Event name mapping** (channel -> client event):

```typescript
const CHANNEL_EVENT_MAP: Record<string, string> = {
  'platform:health': 'health:update',
  'platform:alerts': 'alert:new',
  'platform:onboarding': 'onboarding:update',
};
```

#### `apps/api/src/modules/platform/platform.gateway.spec.ts`

Tests:

1. **Auth acceptance:** Create a mock Socket with a valid JWT in `handshake.auth.token` where the user ID is in the platform owner Redis set. Assert the client is NOT disconnected and is joined to the `'platform-admins'` room.
2. **Auth rejection -- invalid JWT:** Create a mock Socket with an invalid token. Assert `client.disconnect(true)` is called.
3. **Auth rejection -- valid JWT but not platform owner:** Assert `client.disconnect(true)` is called.
4. **Auth rejection -- no token:** Assert `client.disconnect(true)` is called.
5. **Message broadcast:** Simulate a Redis pub/sub message on `platform:health`. Assert the server emits `health:update` to the `'platform-admins'` room with the correct payload.

#### `apps/api/src/modules/platform/redis-pubsub.service.spec.ts`

Tests:

1. **Publish:** Call `publish('platform:health', { status: 'healthy' })`. Assert the publisher Redis client received `publish('platform:health', '{"status":"healthy"}')`.
2. **Subscribe callback:** Simulate a Redis message event. Assert the registered callback is invoked with the parsed JSON.
3. **Unsubscribe:** After unsubscribe, simulate a message. Assert the callback is NOT invoked.

### 4. Files to Modify

#### `apps/api/src/app.module.ts`

- Add `PlatformModule` to imports array
- Add import statement: `import { PlatformModule } from './modules/platform/platform.module';`

#### `apps/api/src/modules/health/health.module.ts`

- Export `HealthService` so the platform module can later use it
- Change: add `exports: [HealthService]` to the module decorator

---

## Frontend Changes

### 1. Install Dependencies

```bash
# In apps/web
npm install socket.io-client
```

### 2. Files to Create

#### `apps/web/src/providers/platform-socket-provider.tsx`

**Component:** `PlatformSocketProvider` (client component)

**Props:** `{ children: React.ReactNode }`

**Context value:**

```typescript
interface PlatformSocketContextValue {
  connected: boolean;
  subscribe: (event: string, callback: (data: unknown) => void) => () => void;
}
```

**Behaviour:**

- On mount, create a Socket.IO client connection to `${API_URL}/platform` with:
  - `auth: { token: getAccessToken() }` (from `@/lib/api-client`)
  - `transports: ['websocket']` (skip long-polling)
  - `reconnection: true`
  - `reconnectionDelay: 1000`
  - `reconnectionDelayMax: 5000`
  - `reconnectionAttempts: Infinity`
- Track `connected` state via `connect`/`disconnect` events
- `subscribe(event, callback)` adds a listener via `socket.on(event, callback)` and returns an unsubscribe function that calls `socket.off(event, callback)`
- On unmount, call `socket.disconnect()`
- If `getAccessToken()` returns null, do not attempt connection (platform pages require auth)

**Reconnection strategy:**

- On `connect_error`, if the error is auth-related (server sends `{ message: 'AUTH_FAILED' }`), do not reconnect -- the token is invalid
- On token refresh (detect via a custom event or polling), reconnect with the new token by calling `socket.auth = { token: getAccessToken() }` then `socket.connect()`

#### `apps/web/src/hooks/use-platform-socket.ts`

**Hook:** `usePlatformSocket()`

**Returns:** `PlatformSocketContextValue` from context

**Usage in components:**

```typescript
const { connected, subscribe } = usePlatformSocket();

React.useEffect(() => {
  const unsub = subscribe('health:update', (data) => {
    // Handle real-time health update
  });
  return unsub;
}, [subscribe]);
```

### 3. Files to Modify

#### `apps/web/src/app/[locale]/(platform)/layout.tsx`

Wrap the existing layout content with `<PlatformSocketProvider>`:

```tsx
import { PlatformSocketProvider } from '@/providers/platform-socket-provider';

// Inside the return, wrap <RequireAuth> children:
<RequireAuth>
  <PlatformSocketProvider>{/* existing layout JSX */}</PlatformSocketProvider>
</RequireAuth>;
```

Add a connection status indicator in the header (small dot next to the title):

```tsx
const { connected } = usePlatformSocket();

// In the header:
<div className={cn('h-2 w-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')} />;
```

---

## Testing Strategy

### Backend Unit Tests

| Test File                      | What It Tests                                                             |
| ------------------------------ | ------------------------------------------------------------------------- |
| `platform.gateway.spec.ts`     | Auth handshake (4 cases), message broadcast routing                       |
| `redis-pubsub.service.spec.ts` | Publish serialization, subscribe callback invocation, unsubscribe cleanup |

### Manual Verification

1. Start the API server
2. Open the platform admin dashboard in the browser
3. Open browser DevTools -> Network -> WS tab
4. Verify a WebSocket connection is established to `/platform`
5. Verify the connection stays alive (no disconnect/reconnect loop)
6. Kill Redis briefly and verify the connection status indicator turns red

---

## Acceptance Criteria

- [ ] `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` installed in `apps/api/package.json`
- [ ] `socket.io-client` installed in `apps/web/package.json`
- [ ] `PlatformModule` registered in `AppModule`
- [ ] WebSocket gateway at `/platform` namespace accepts connections with valid platform-owner JWT
- [ ] WebSocket gateway rejects connections without a token, with an invalid token, or from non-platform-owner users
- [ ] `RedisPubSubService` can publish messages to any `platform:*` channel
- [ ] `RedisPubSubService` receives messages from subscribed channels and invokes callbacks
- [ ] `PlatformGateway` bridges Redis pub/sub messages to Socket.IO events
- [ ] Frontend `PlatformSocketProvider` establishes a Socket.IO connection on mount
- [ ] Frontend `usePlatformSocket()` hook provides `connected` state and `subscribe` function
- [ ] Connection status indicator visible in platform layout header
- [ ] Auto-reconnection works after brief disconnections
- [ ] All tests pass: `platform.gateway.spec.ts`, `redis-pubsub.service.spec.ts`
- [ ] `turbo lint` and `turbo type-check` pass with no new errors
- [ ] No existing tests regress

---

## File Summary

### Files to Create (7)

| File                                                         | Type              |
| ------------------------------------------------------------ | ----------------- |
| `apps/api/src/modules/platform/platform.module.ts`           | NestJS module     |
| `apps/api/src/modules/platform/platform.gateway.ts`          | WebSocket gateway |
| `apps/api/src/modules/platform/platform.gateway.spec.ts`     | Test              |
| `apps/api/src/modules/platform/redis-pubsub.service.ts`      | Service           |
| `apps/api/src/modules/platform/redis-pubsub.service.spec.ts` | Test              |
| `apps/web/src/providers/platform-socket-provider.tsx`        | React provider    |
| `apps/web/src/hooks/use-platform-socket.ts`                  | React hook        |

### Files to Modify (3)

| File                                              | Change                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `apps/api/src/app.module.ts`                      | Add `PlatformModule` to imports                              |
| `apps/api/src/modules/health/health.module.ts`    | Add `exports: [HealthService]`                               |
| `apps/web/src/app/[locale]/(platform)/layout.tsx` | Wrap with `PlatformSocketProvider`, add connection indicator |
