<?php
namespace npc;
// 读取原版 NPC 配置，输出为 data/npcs.json
require_once __DIR__.'/../DTS-SAMPLE/include/modules/base/npc/config/npc.data.config.php';

function combine(array $init, array $info): array {
    $copy = $info;
    unset($copy['sub']);
    return array_merge($init, $copy);
}

$all = [];
foreach ($npcinfo as $type => $group) {
    $base = combine($npcinit, $group);
    $sub = $group['sub'] ?? [];
    $i = 1;
    foreach ($sub as $npc) {
        $data = array_merge($base, $npc);
        $data['type'] = $type;
        $data['pid'] = $type * 1000 + $i;
        unset($data['sub']);
        $all[] = $data;
        $i++;
    }
}

file_put_contents(__DIR__.'/../data/npcs.json', json_encode($all, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));

?>
