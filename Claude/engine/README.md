# 🔧 引擎轨

**职能**:服务端 / kaleido 状态机 / 战斗模板运行时 / 采样器代码 / E2E 状态机资产共管 / 将来 P2 生成管线。
**归属**:`src/lib/server/kaleido/**`、`src/lib/server/gameActions.js`(主归属·2026-07-07 自 🧭 移交)、`src/lib/combatPipeline.js` 等引擎层、`scripts/kaleido-e2e.mjs`。
**当前状态(2026-07-07)**:⏸ kickoff 已收、通读上手中,**未开工**(今晚仅剧情轨运行)。
**恢复后队列(KP1-E)**:①LW-3 gauntlet 波次推进层 ②D3 mergeGameRules 逐关覆盖+clearRulesCache 调用点 ③D5 R3 seed 化 ④承接 ⚙️/📖 引擎钩子。详见 docs/plan/kaleido/03「KP1 重切」段。
**铁律**:改状态机必跑 `scripts/kaleido-e2e.mjs`(无 key 找 🧭 代跑);isKaleidoRoom 守卫纪律+多人局零变化自证;软锁教训(04 §5.1):遭遇/体力/lifecycle 交界逐条推演。
**交付史注记**:KP0-S/KP1-S(D4/D2/D1/LW-1/LW-2)由 ⚙️(时任)交付,史料在 [log.md](log.md) 历史段。
