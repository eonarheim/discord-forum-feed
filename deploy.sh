docker buildx build --platform linux/arm64 --load -t verekia/discord-webgamedev .
docker save -o /tmp/discord-webgamedev.tar verekia/discord-webgamedev
scp /tmp/discord-webgamedev.tar midgar:/tmp/
ssh midgar docker load --input /tmp/discord-webgamedev.tar
ssh midgar docker compose up -d discord-webgamedev
