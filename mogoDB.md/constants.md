# constants 集合

用于存储游戏常量，便于动态调整数值。

```javascript
use dts;
db.constants.insertMany([
  { key: 'START_THRESHOLD', value: 20 },
  { key: 'AREA_INTERVAL', value: 1200 },
  { key: 'AREA_ADD', value: 2 },
  { key: 'WEATHER_ACTIVE_OBBS', value: [10,20,0,-5,-10,-20,-15,0,-7,-10,-10,-5,0,-5,-20,-5,0,20] },
  { key: 'MOVE_SP_COST', value: 15 },
  { key: 'SEARCH_SP_COST', value: 15 },
  { key: 'ATTACK_SP_COST', value: 20 }
]);
```

创建集合后可按需修改数值并重启服务生效。

## 新增暴击与闪避相关常量

合并 `feat: enhance combat logic` 后新增下列配置，用于控制暴击与闪避机制：

```javascript
use dts;
db.constants.insertMany([
  { key: 'CRIT_BASE_RATE', value: 0.05 },  // 基础暴击概率
  { key: 'DODGE_BASE_RATE', value: 0.05 }, // 基础闪避概率
  { key: 'CRIT_MULTIPLIER', value: 1.5 }   // 暴击伤害乘区
]);
```

若集合中已存在同名键，可通过 `updateOne` 调整对应数值。

## 新增慢请求警告阈值

用于性能监控的中间件依赖 `SLOW_REQUEST_THRESHOLD` 常量，单位为毫秒：

```javascript
use dts;
db.constants.insertOne({ key: 'SLOW_REQUEST_THRESHOLD', value: 1000 });
```

可根据需求调整阈值大小后重启服务生效。
