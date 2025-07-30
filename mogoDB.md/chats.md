# chats 集合示例

`chats` 集合来源于 DTS-SAMPLE 的 `bra_chat` 表。以下示例展示如何插入两条聊天记录。

```javascript
use dts;
db.chats.insertMany([
  { cid: 1, type: 0, time: 0, send: 'Alice', recv: '', msg: '大家好' },
  { cid: 2, type: 2, time: 5, send: 'Bob', recv: 'Alice', msg: '私聊消息' }
]);
```

字段含义与 `backend/src/models/Chat.js` 完全一致。

## 推荐索引

按照聊天编号和时间建立复合索引，以便按时间倒序查询：

```javascript
db.chats.createIndex({ cid: 1, time: -1 });
```
