#!/bin/bash
cd "$(dirname "$0")"
N=1800; W=4; step=$((N/W))
for i in $(seq 0 $((W-1))); do
  node render.js out/part$i.mp4 $((i*step)) $(((i+1)*step)) 4 2> out/log$i.txt &
done
wait
printf "file 'part%d.mp4'\n" 0 1 2 3 > out/list.txt
ffmpeg -v error -y -f concat -safe 0 -i out/list.txt -c copy out/video_only.mp4
echo DONE
