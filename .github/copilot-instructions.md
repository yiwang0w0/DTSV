# Copilot Instructions for DTS Game

## Project Overview
**DTS** is a modern web-based battle royale/strategy game built with Next.js 14. It features:
- Real-time multiplayer game rooms with dynamic player states
- 34 themed maps with weather system affecting gameplay
- Admin panel for managing game content (NPCs, items, maps)
- Supabase-powered authentication and real-time database

## Tech Stack & Key Dependencies
- **Framework**: Next.js 14 (App Router, Server/Client components)
- **UI**: React 18, Tailwind CSS 3 (dark theme), inline styles (heavy usage)
- **Backend**: Supabase + PostgreSQL (auth, realtime subscriptions)
- **Styling**: GitHub-inspired dark colors (`#0e1117`, `#58a6ff` accent)
- **Language**: Chinese (zh) interface

## Architecture & Core Patterns

### Auth & State Management
- **Pattern**: Context API with `AuthContext` in [src/app/layout.js](src/app/layout.js#L1)
- **Hook**: `useAuth()` - access auth context globally from any client component
- **Supabase Integration**: 
  ```javascript
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...)
  ```
- User metadata stored in `user_metadata.username` field

### Real-Time Updates
- **Supabase Channels**: Subscribe to table changes in `useEffect`:
  ```javascript
  const channel = supabase.channel(`room-${roomId}`)
    .on('postgres_changes', { event: 'UPDATE', ... }, (payload) => setRoom(payload.new))
    .subscribe()
  return () => { supabase.removeChannel(channel) }
  ```
- Used for: rooms list updates, game state changes, log entries

### Client Components
- All pages use `'use client'` directive
- Heavy reliance on `useState`, `useEffect`, `useCallback`
- Refs for scroll management: `useRef(null)` + `scrollTop = scrollHeight`

## Key Components & Database Schema

### Game Room Model (rooms table)
```javascript
{
  id: number,
  gamenum: number,           // Human-readable game ID
  gametype: 0|2|11-14,       // From GAME_TYPES constant
  gamestate: 0|1|2,          // 0=waiting, 1=active, 2=ended
  gamevars: {                // Core game state object
    players: {
      [userId]: {
        id: string,
        name: string,
        hp: number,
        maxHp: number,
        atk: number,           // Attack power
        def: number,           // Defense
        map: number,           // Current map ID (0-34)
        inventory: array,      // Items held
        alive: boolean,
        kills: number
      }
    },
    log: string[],           // Game event log
    turn: number,
    mapItems: {},            // Items on maps
    mapNpcs: {}              // NPCs active on maps
  }
}
```

### Core Constants ([src/lib/constants.js](src/lib/constants.js))
- **MAP_LIST**: 35 maps (id 0-34) with anime/game references
- **GAME_TYPES**: `{ 0: '个人战', 2: 'PVE', 11-14: team battles, 14: '自由团战' }`
- **WEATHER_OPTIONS**: Effects include accuracy changes, vision reduction, stat penalties
- **ITEM_KIND_META**: `{ weapon, armor, consumable, special }` with colors & emojis
- **NPC_LEVEL_META**: `{ easy, medium, hard, boss }` difficulty levels

### Admin Panel ([src/app/admin/page.js](src/app/admin/page.js))
- UI Utilities: `useToast()` hook (auto-dismiss notifications), `<Modal>` component
- Manages: NPCs, items, map configurations, weather, game type settings
- Pattern: Inline styles + Tailwind color variables

## UI Patterns & Conventions

### Toast Notifications
```javascript
const { show, Container } = useToast()
show('Success message', 'success')    // or 'error'
return <Container /> // Render in component
```

### Modal Dialog
```javascript
<Modal open={showModal} onClose={() => setShowModal(false)} title="Create Item">
  {/* Modal content */}
</Modal>
```

### Styling Approach
- **Primary**: Inline styles (CSSProperties objects)
- **Colors**: GitHub dark theme - use `#58a6ff` (accent), `#8b949e` (muted), `#f85149` (error)
- **Layout**: Flexbox via inline `display: 'flex'`, `gap`, `justifyContent`
- **Animation Classes**: `animate-in` class (auto-applies fade/in animation)
- **Fonts**: DM Sans (body), JetBrains Mono (code/titles), Noto Sans SC (Chinese)

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/app/layout.js](src/app/layout.js) | Root layout with auth context, nav component |
| [src/app/page.js](src/app/page.js) | Homepage with game stats and CTA |
| [src/app/rooms/page.js](src/app/rooms/page.js) | Room lobby - list, create, join rooms |
| [src/app/game/[id]/page.js](src/app/game/[id]/page.js) | Active game room view, player actions |
| [src/app/admin/page.js](src/app/admin/page.js) | Admin dashboard (490 lines, modals & forms) |
| [src/lib/supabase.js](src/lib/supabase.js) | Supabase client initialization |
| [src/lib/constants.js](src/lib/constants.js) | Game data (maps, types, weather, items, NPCs) |
| [tailwind.config.js](tailwind.config.js) | Theme colors: `bg`, `surface`, `card`, `border`, `accent` |

## Development Workflow

### Running the App
```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm start        # Production start
```

### Environment Setup
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### API Structure
- **Current State**: Empty API route folders exist (`/api/auth/`, `/game/`, `/rooms/`, `/admin/items/`, `/admin/maps/`, `/admin/npcs/`).
  - 新增 `/api/admin/rooms` 用于后台操作（如删除房间），接口示例在项目中已有实现。
- **Convention**: When implementing: use Next.js route handlers (`route.js`), follow RESTful patterns
- **Auth**: Protect routes via Supabase JWT validation; use `src/lib/auth.js` 中的 `isAdmin()` 等函数帮助判定管理员权限

## Project-Specific Conventions

1. **Path Aliases**: Use `@/` prefix for `src/` imports (e.g., `@/lib/supabase`)
2. **Component Patterns**: Favor functional components, hooks over class components
3. **State Updates**: For nested objects (gamevars), create new object references: `{ ...gv, players: {...} }`
4. **Supabase Queries**: Always include error handling, check for null responses
5. **Real-time Sync**: Auto-unsubscribe from channels in cleanup functions
6. **Chinese Content**: Use Chinese labels/placeholders; all user-facing text in Chinese
7. **Game State**: Player objects in `gamevars.players[userId]` - use userId as key, not username
8. **用户组权限**：
   - 在 `user.user_metadata.groups` 中存放字符串数组，如 `['user']`、`['admin']`。
   - `src/lib/auth.js` 提供 `hasGroup(user, group)` 和 `isAdmin(user)` 等工具。
   - 登记时 (`/register`) 自动将用户置于 `user` 组，若邮箱为特定管理员邮箱（`2949215486@qq.com`）则附加 `admin` 组。
   - 登录页会再次校验并写入 metadata，避免已有账号缺失 `admin` 组。
   - 页面布局(`src/app/layout.js`)的 auth effect 在每次认证状态变化时调用 `ensureAdminMetadata`。
   - 前端导航栏和 `/admin` 页面使用 `isAdmin()` 隐藏/保护管理员功能。

## Common Workflows

### Adding a New Map
1. Add entry to `MAP_LIST` in [src/lib/constants.js](src/lib/constants.js)
2. Update any map selection dropdowns (likely in admin panel)
3. Test in [src/app/game/[id]/page.js](src/app/game/[id]/page.js) map rendering

### Creating a Game API Endpoint
1. Create `src/app/api/[resource]/route.js`
2. Handle POST/GET with Supabase CRUD operations
3. Always validate user auth: check `supabase.auth.getUser()`
4. Return `Response` objects with proper status codes

### Updating Player State in Game
1. Fetch room: `supabase.from('rooms').select('*').eq('id', roomId).single()`
2. Modify `gamevars` object (create new references for nested updates)
3. Broadcast change: `await supabase.from('rooms').update({ gamevars }).eq('id', roomId)`
4. Real-time subscribers receive immediate update via channel

## Known Characteristics
- Heavy use of inline CSS - external stylesheet (`globals.css`) exists but unused for component styling
- No TypeScript currently (JS project)
- Components typically self-contained in single pages, minimal component extraction
- Emoji-heavy UI for visual appeal (⚔️, 🛡️, 💊, etc.)
- Game logic stored in database `gamevars`, not in-app state beyond UI
