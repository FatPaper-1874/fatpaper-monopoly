<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { RoleInRoom } from "@mine-monopoly/types";

const { role } = defineProps<{ role: RoleInRoom }>();

const roleImageUrl = computed(() => `${role.imageUrl}`);

// 处理描述文本中的换行符
const formattedDescription = computed(() => {
	return role.description.replace(/\\n/g, '\n');
});
</script>

<template>
	<div class="role-preview">
		<div class="role-info">
			<div class="name" :style="{ 'background-color': role.color }">{{ role.name }}</div>
			<div class="description">{{ formattedDescription }}</div>
		</div>
		<div class="role-image-container">
			<img class="role-image" :src="roleImageUrl" />
		</div>
	</div>
</template>

<style lang="scss" scoped>
.role-preview {
	width: 20rem;
	height: 30rem;
	aspect-ratio: 0.75;
	border: 0.4rem solid #ffffff;
	border-radius: 1rem;
	box-sizing: border-box;
	overflow: hidden;
	position: relative;
	cursor: pointer;
}
.role-info {
	position: absolute;
	width: 100%;
	height: 100%;
	left: 0;
	top: 0;
	z-index: 100;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	pointer-events: none;

	& > .name {
		width: max-content;
		display: inline-block;
		padding: 0.6em 1em;
		border-radius: 0 0.6em 0.6em 0.6em;
		background-color: var(--fp-color-secondary);
		color: var(--fp-color-text-white);
		text-shadow: 0 0.1rem 0.2rem rgba(0, 0, 0, 0.3);
		pointer-events: auto;
	}

	& > .description {
		padding: 0.6em 0.8em;
		margin: 0.6em 0.8em;
		max-height: 30%;
		color: #ffffff;
		background-color: rgba(196, 196, 196, 0.65);
		font-size: 0.95em;
		line-height: 1.3;
		text-shadow: 0 0.1rem 0.2rem rgba(0, 0, 0, 0.5);
		word-wrap: break-word;
		overflow-y: auto;
		max-height: 40%;
		border-radius: .4rem;
		white-space: pre-wrap; /* 支持 \n 换行，保留空格 */

		&::-webkit-scrollbar {
			width: 0.2rem;
		}

		&::-webkit-scrollbar-thumb {
			background-color: rgba(255, 255, 255, 0.3);
			border-radius: 0.1rem;
		}
	}
}
.role-image-container {
	width: 100%;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
	background-color: #e4e4e4;
	padding: 1rem;
	box-sizing: border-box;

	.role-image {
		display: block;
		width: 100%;
		max-height: 100%;
		object-fit: contain;
		margin: auto;
	}
}
</style>
