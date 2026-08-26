<script setup lang="ts">
import { ChatMessage } from "@mine-monopoly/types";
import { computed } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { __PROTOCOL__ } from "@src/../global.config";

const props = defineProps<{ chatMessage: ChatMessage }>();
const { user, type, content } = props.chatMessage ?? ({} as ChatMessage);
const avatarSrc = computed(() => {
	return user?.avatar || "";
});

const color = user?.color;
</script>

<template>
	<div class="chat_message-item">
		<div class="avatar">
			<img v-if="avatarSrc" :src="avatarSrc" />
			<FontAwesomeIcon v-else :style="{ color: color }" icon="gamepad" />
		</div>
		<div class="right-container">
			<span class="name" :style="{ color: user.color }">{{ user.username }}</span>
			<span class="content">{{ content }}</span>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.chat_message-item {
	width: auto;
	max-width: 100%;
	display: flex;
	margin-bottom: 0.5rem;

	& > .avatar {
		$avatar_size: 2rem;
		width: $avatar_size;
		height: $avatar_size;
		border-radius: 50%;
		border: 0.15rem solid #ffffff;
		overflow: hidden;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: rgba(255, 255, 255, 0.45);

		& > img {
			$avatar_size: 2rem;
			width: $avatar_size;
			height: $avatar_size;
		}
	}

	.right-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		margin-left: 0.4rem;

		& > .name {
			font-size: 0.7rem;
		}

		& > .content {
			width: fit-content;
			background-color: #ffffff;
			word-wrap: normal;
			word-break: break-word;
			margin-top: 0.1rem;
			padding: 0.2rem 0.4rem;
			border-radius: 0.3rem;
			box-shadow: var(--fp-shadow-md);
		}
	}
}
</style>
@src/global.config
