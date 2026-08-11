<?php
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, must-revalidate');
readfile(__DIR__ . '/index.html');
