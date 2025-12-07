[1mdiff --git a/node_js/src/data/routeMaster.json b/node_js/src/data/routeMaster.json[m
[1mindex e945bdf..26a5264 100644[m
[1m--- a/node_js/src/data/routeMaster.json[m
[1m+++ b/node_js/src/data/routeMaster.json[m
[36m@@ -1,30 +1,39 @@[m
[31m-[[m
[32m+[m[32m﻿[[m
   {[m
[31m-    "routeId": "CP_ANSAN_TO_ASAN",[m
[31m-    "busType": "campus",[m
[31m-    "startId": "안산",[m
[32m+[m[32m    "routeId": "SH_TERMINAL_TO_ASAN",[m
[32m+[m[32m    "busType": "shuttle",[m
[32m+[m[32m    "startId": "천안터미널",[m
     "stopId": "아산캠퍼스",[m
[31m-    "routeTitle": "안산 → 아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "천안 터미널 → 아산캠퍼스",[m
     "weekdayType": "WEEKDAY",[m
[31m-    "departures": ["07:00", "08:30"][m
[32m+[m[32m    "departures": ["07:30", "09:05", "11:45", "15:10"][m
   },[m
   {[m
[31m-    "routeId": "CP_SEONGNAM_TO_ASAN",[m
[31m-    "busType": "campus",[m
[31m-    "startId": "성남(분당)",[m
[32m+[m[32m    "routeId": "SH_ASHAN_LOOP",[m
[32m+[m[32m    "busType": "shuttle",[m
[32m+[m[32m    "startId": "아산(KTX)역",[m
     "stopId": "아산캠퍼스",[m
[31m-    "routeTitle": "성남(분당) → 아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "아산(KTX)역 → 아산캠퍼스",[m
     "weekdayType": "WEEKDAY",[m
[31m-    "departures": ["07:30", "08:30"][m
[32m+[m[32m    "departures": ["07:40", "08:45", "11:30", "15:20"][m
   },[m
   {[m
[31m-    "routeId": "SH_ASHAN_LOOP",[m
[32m+[m[32m    "routeId": "SH_ONYANG_TO_ASAN",[m
     "busType": "shuttle",[m
[31m-    "startId": "아산(KTX)역",[m
[32m+[m[32m    "startId": "온양터미널/역",[m
     "stopId": "아산캠퍼스",[m
[31m-    "routeTitle": "아산(KTX)역 → 아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "온양터미널/역 → 아산캠퍼스",[m
     "weekdayType": "WEEKDAY",[m
[31m-    "departures": ["07:20", "18:00"][m
[32m+[m[32m    "departures": ["07:50", "08:35", "12:30", "15:50"][m
[32m+[m[32m  },[m
[32m+[m[32m  {[m
[32m+[m[32m    "routeId": "SH_CHEONAN_STATION_TO_ASAN",[m
[32m+[m[32m    "busType": "shuttle",[m
[32m+[m[32m    "startId": "천안역",[m
[32m+[m[32m    "stopId": "아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "천안역 → 아산캠퍼스",[m
[32m+[m[32m    "weekdayType": "WEEKDAY",[m
[32m+[m[32m    "departures": ["08:10", "08:55", "12:00", "15:40"][m
   },[m
   {[m
     "routeId": "CP_SEOUL_TO_ASAN",[m
[36m@@ -35,6 +44,15 @@[m
     "weekdayType": "WEEKDAY",[m
     "departures": ["06:30", "17:30"][m
   },[m
[32m+[m[32m  {[m
[32m+[m[32m    "routeId": "CP_ANSAN_TO_ASAN",[m
[32m+[m[32m    "busType": "campus",[m
[32m+[m[32m    "startId": "안산",[m
[32m+[m[32m    "stopId": "아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "안산 → 아산캠퍼스",[m
[32m+[m[32m    "weekdayType": "WEEKDAY",[m
[32m+[m[32m    "departures": ["07:00"][m
[32m+[m[32m  },[m
   {[m
     "routeId": "CP_GYEONGGI_TO_ASAN",[m
     "busType": "campus",[m
[36m@@ -43,5 +61,14 @@[m
     "routeTitle": "천안 → 아산캠퍼스",[m
     "weekdayType": "WEEKDAY",[m
     "departures": ["07:10"][m
[32m+[m[32m  },[m
[32m+[m[32m  {[m
[32m+[m[32m    "routeId": "CP_SEONGNAM_TO_ASAN",[m
[32m+[m[32m    "busType": "campus",[m
[32m+[m[32m    "startId": "성남(분당)",[m
[32m+[m[32m    "stopId": "아산캠퍼스",[m
[32m+[m[32m    "routeTitle": "성남(분당) → 아산캠퍼스",[m
[32m+[m[32m    "weekdayType": "WEEKDAY",[m
[32m+[m[32m    "departures": ["07:30", "08:30"][m
   }[m
 ][m
