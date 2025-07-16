<?php
// 解析副本配置并输出到 data/instances
$base = __DIR__.'/../DTS-SAMPLE/include/modules/extra/instance';
$target = __DIR__.'/../data/instances';
if (!file_exists($target)) {
    mkdir($target, 0777, true);
}

foreach (glob("$base/*/config", GLOB_ONLYDIR) as $dir) {
    $instance = basename(dirname($dir));
    $outdir = "$target/$instance";
    if (!file_exists($outdir)) {
        mkdir($outdir, 0777, true);
    }
    // npc data
    $npcfile = "$dir/npc.data.config.php";
    if (file_exists($npcfile)) {
        include $npcfile;
        if (preg_match('/instance(\d+)/', $instance, $m)) {
            $var = 'npcinfo_instance'.$m[1];
            if (isset($$var)) {
                file_put_contents("$outdir/npc.data.json", json_encode($$var, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
            }
        }
    }
    // mapitem and trapitem
    foreach (['mapitem','trapitem'] as $type) {
        $file = "$dir/$type.config.php";
        if (!file_exists($file)) continue;
        $lines = file($file, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
        $data = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0]=='<' || $line[0]=='/' || $line[0]=='=') continue;
            $parts = explode(',', $line);
            if (count($parts) < 8) continue;
            list($time,$area,$num,$itm,$itmk,$itme,$itms,$itmsk) = $parts;
            for ($i=0; $i<(int)$num; $i++) {
                $data[] = [
                    'time'=>(int)$time,
                    'area'=>(int)$area,
                    'itm'=>$itm,
                    'itmk'=>$itmk,
                    'itme'=>(int)$itme,
                    'itms'=>(int)$itms,
                    'itmsk'=>$itmsk
                ];
            }
        }
        file_put_contents("$outdir/$type.json", json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
    }
}
?>
