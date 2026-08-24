<script setup lang="ts">
import { useLocalParty } from "@src/store/local-party";
import OnlineRoom from "./components/online-room/online-room.vue";
import LocalPartyRoom from "./components/local-party-room/local-party-room.vue";

const localPartyStore = useLocalParty();
</script>

<template>
	<LocalPartyRoom v-if="localPartyStore.isActive" />
	<OnlineRoom v-else />
</template>
