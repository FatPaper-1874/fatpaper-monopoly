import { MonopolyHost } from "./MonopolyHost";
import {
	ClientSocketMessage,
	GameEventType,
	OperateType,
	PlayerInfo,
	PropertyInfo,
	SocketMessage,
	SocketMsgType,
} from "@mine-monopoly/types";
import { debounce } from "@src/utils";
import { SocketMsgSource } from "@mine-monopoly/types";
import { FPMessage } from "@mine-monopoly/ui";
import { FPMessageBox } from "@src/components/utils/fp-message-box";
import router from "@src/router";
import useEventBus from "@src/utils/event-bus";
import { createVNode } from "vue";
import PropertyInfoVue from "@src/components/common/property-card.vue";
import { DataConnection } from "peerjs";

type ClientMessageHandler<T extends SocketMsgType> = (
	conn: DataConnection,
	msg: SocketMessage<T, SocketMsgSource.Client>,
	host: MonopolyHost,
	clientId: string,
) => void;

export function handleClientSocketMessage(
	conn: DataConnection,
	msg: ClientSocketMessage,
	host: MonopolyHost,
	clientId: string,
) {
	switch (msg.type) {
		case SocketMsgType.Heart:
			// noHeartHandler.fn();
			handleHeart(conn, msg, host, clientId);
			break;
		case SocketMsgType.RoomChat:
			handleRoomChat(conn, msg, host, clientId);
			break;
		case SocketMsgType.ReadyToggle:
			handleReadyToggle(conn, msg, host, clientId);
			break;
		case SocketMsgType.KickOut:
			handleKickOut(conn, msg, host, clientId);
			break;
		case SocketMsgType.ChangeColor:
			handleChangeColor(conn, msg, host, clientId);
			break;
		case SocketMsgType.ChangeMap:
			handleChangeMap(conn, msg, host, clientId);
			break;
		case SocketMsgType.MapLocalCheck:
			handleMapLocalCheck(conn, msg, host, clientId);
			break;
		case SocketMsgType.MapTransferRequest:
			handleMapTransferRequest(conn, msg, host, clientId);
			break;
		case SocketMsgType.ChangeRole:
			handleChangeRole(conn, msg, host, clientId);
			break;
		case SocketMsgType.ChangeGameSetting:
			handleChangeGameSetting(conn, msg, host, clientId);
			break;
		case SocketMsgType.GameStart:
			handleGameStart(conn, msg, host, clientId);
			break;
		case SocketMsgType.Operation:
			handleOperation(conn, msg, host, clientId);
			break;
		case SocketMsgType.LeaveRoom:
			handleLeaveRoom(conn, msg, host, clientId);
			break;
		default:
			break;
	}
}

const handleHeart: ClientMessageHandler<SocketMsgType.Heart> = (conn, msg, host, clientId) => {
	host.getRoom().sendToClient(conn, SocketMsgType.Heart);
};
const handleRoomChat: ClientMessageHandler<SocketMsgType.RoomChat> = (conn, msg, host, clientId) => {
	const message = msg.data;
	host.getRoom().chatBroadcast(message, clientId);
};
const handleReadyToggle: ClientMessageHandler<SocketMsgType.ReadyToggle> = (conn, msg, host, clientId) => {
	host.getRoom().readyToggle(clientId);
};
const handleKickOut: ClientMessageHandler<SocketMsgType.KickOut> = (conn, msg, host, clientId) => {
	const playerId = msg.data;
	if (host.getRoom().isAiPlayer(playerId)) {
		host.getRoom().removeAiPlayer(playerId);
		return;
	}
	host.getRoom().sendToClientById(playerId, SocketMsgType.KickOut);
	host.getRoom().leave(playerId);
	host.deleteClient(playerId);
};
const handleChangeColor: ClientMessageHandler<SocketMsgType.ChangeColor> = (conn, msg, host, clientId) => {
	host.getRoom().changeColor(clientId, msg.data);
};
const handleChangeMap: ClientMessageHandler<SocketMsgType.ChangeMap> = (conn, msg, host, clientId) => {
	void host.getRoom().changeMap(msg.data);
};
const handleMapLocalCheck: ClientMessageHandler<SocketMsgType.MapLocalCheck> = (conn, msg, host, clientId) => {
	host.getRoom().handleMapLocalCheck(clientId, msg.data);
};
const handleMapTransferRequest: ClientMessageHandler<SocketMsgType.MapTransferRequest> = (conn, msg, host, clientId) => {
	host.getRoom().handleMapTransferRequest(clientId, msg.data);
};
const handleChangeRole: ClientMessageHandler<SocketMsgType.ChangeRole> = (conn, msg, host, clientId) => {
	host.getRoom().changeRole(clientId, msg.data);
};
const handleChangeGameSetting: ClientMessageHandler<SocketMsgType.ChangeGameSetting> = (conn, msg, host, clientId) => {
	host.getRoom().changeGameSetting(msg.data);
};
const handleGameStart: ClientMessageHandler<SocketMsgType.GameStart> = (conn, msg, host, clientId) => {
	host.getRoom().startGame();
};
const handleOperation: ClientMessageHandler<SocketMsgType.Operation> = (conn, msg, host, clientId) => {
	const { operateType, data } = msg.data;
	const room = host.getRoom();

	// 非房主请求暂停/恢复：由房主代为执行（实现任意玩家可请求暂停）
	if (clientId !== room.getOwnerId() && (operateType === OperateType.PauseGame || operateType === OperateType.ResumeGame)) {
		room.emitOperation(room.getOwnerId(), operateType, data, msg.extra);
		return;
	}

	// 自定义地图加载完成必须匹配当前会话，迟到的旧消息不可唤醒等待者。
	if (operateType === OperateType.MapResourceLoaded) {
		if (room.handleMapResourceLoaded(clientId, (msg.extra as { mapLoadSessionId?: unknown } | undefined)?.mapLoadSessionId, msg.extra)) {
			host.resumeClientHeartCheck(clientId);
		}
		return;
	}

	// 心跳检查逻辑
	if (operateType === OperateType.LoadingStarted) {
		host.pauseClientHeartCheck(clientId);
	} else if (operateType === OperateType.GameInitFinished) {
		host.resumeClientHeartCheck(clientId);
	}

	// 安全模式操作处理（只有房主可以执行）
	if (clientId === room.getOwnerId()) {
		if (operateType === OperateType.SafeModeSaveAndExit) {
			room.saveAndExitFromSafeMode();
		} else if (operateType === OperateType.SafeModeAbort) {
			room.abandonGame();
		} else {
			// 其他操作转发给 Worker
			room.emitOperation(clientId, operateType, data, msg.extra);
		}
	} else {
		// 非房主的操作转发给 Worker
		room.emitOperation(clientId, operateType, data, msg.extra);
	}
};
const handleLeaveRoom: ClientMessageHandler<SocketMsgType.LeaveRoom> = (conn, msg, host, clientId) => {
	const room = host.getRoom();
	const isOwnerLeaving = room.getOwnerId() === clientId;
	const isGameStarted = room.isStarted;

	if (isOwnerLeaving && isGameStarted) {
		// 房主在游戏中退出：向其他玩家发送 LeaveRoom 让他们正常退出，然后销毁
		const userList = room.getUserList();
		for (const user of userList) {
			if (user.userId !== clientId) {
				room.sendToClientById(user.userId, SocketMsgType.LeaveRoom, undefined, {
					type: "error",
					content: "房主已退出，游戏即将解散",
				});
			}
		}
		setTimeout(() => {
			host.destory();
		}, 500);
	} else {
		if (room.leave(clientId)) {
			host.destory();
		}
	}
	conn.close();
	host.deleteClient(clientId);
};

