export const enum SocketMsgType {
	Heart = "Heart", //心跳信息
	MsgNotify = "MsgNotify", //纯信息广播
	GameLog = "GameLog", //游戏过程信息广播
	UserList = "UserList", //大厅玩家信息广播
	RoomList = "RoomList", //房间列表广播
	JoinRoom = "JoinRoom", //加入房间
	LeaveRoom = "LeaveRoom", //离开房间
	RoomInfo = "RoomInfo", //房间信息广播
	RoomChat = "RoomChat", //房间聊天
	ReadyToggle = "ReadyToggle", //准备状态切换
	ChangeColor = "ChangeColor", //切换颜色
	KickOut = "KickOut", //踢出房间
	ChangeMap = "ChangeMap", //切换地图
	ChangeRole = "ChangeRole", //切换角色
	ChangeGameSetting = "ChangeGameSetting", //修改游戏设置信息
	GameStart = "GameStart", //游戏开始
	GameInit = "GameInit", //游戏初始化
	GameInitFinished = "GameInitFinished", //游戏初始化完成
	GameInitAborted = "GameInitAborted", //游戏初始化失败并退出游戏页
	GameData = "GameData", //游戏信息广播
	GainMoney = "GainMoney", //玩家获得金钱
	CostMoney = "CostMoney", //玩家花费金钱
	RoundTurn = "RoundTurn", //更新当前回合轮到的玩家
	RollDiceStart = "RollDiceStart", //开始摇骰子
	RollDiceResult = "RollDiceResult", //掷骰子
	UseChanceCard = "UseChanceCard", //使用机会卡
	RemainingTime = "RemainingTime", //回合剩余时间
	CurrentEventName = "CurrentEventName", //当前事件名称
	RoundTimeOut = "RoundTimeOut", //回合超时
	PlayerWalk = "PlayerWalk", //位置移动方式1：玩家角色走路
	PlayerTp = "PlayerTp", //位置移动方式2：传送
	MapPathChoiceRequest = "MapPathChoiceRequest", //宿主请求当前玩家选择地图路径
	Operation = "Operation", //玩家操作
	Bankrupt = "Bankrupt", //破产
	GameOver = "GameOver", //游戏结束
	PauseGame = "PauseGame", //房主暂停游戏
	ResumeGame = "ResumeGame", //房主恢复游戏

	ConfirmDialog = "ConfirmDialog", //在客户端唤起确认dialog
	TargetSelectDialog = "TargetSelectDialog", //在客户端唤起目标选择dialog
	ItemSelectDialog = "ItemSelectDialog", //在客户端唤起自定义选择dialog
	MessageCard = "MessageCard", //在客户端唤起信息无交互的dialog
	UI = "UI", //在客户端增添UI
	/** 表单对话框 */
	FormDialog = "FormDialog",
	/** Loading 控制 */
	LoadingControl = "LoadingControl",
	/** 按钮注册 */
	ButtonRegister = "ButtonRegister",
	/** 按钮状态变更 */
	ButtonStateChanged = "ButtonStateChanged",
	/** 按钮移除 */
	ButtonRemove = "ButtonRemove",
	/** 安全模式操作面板 */
	SafeModePanel = "SafeModePanel", // 安全模式操作面板
	MapChunkStart = "MapChunkStart", // 开始分块传输地图数据
	MapChunk = "MapChunk",          // 单个地图数据分块
	MapChunkEnd = "MapChunkEnd",    // 分块传输完成
	MapChunkAbort = "MapChunkAbort", // 中止分块传输
	MapChunkAck = "MapChunkAck",     // 分块接收确认
	/** 地图事件动态变更（添加/移除/关联） */
	MapEventChanged = "MapEventChanged",
}

export enum SocketMsgSource {
	Client = "client",
	Server = "server",
}

export enum ChangeRoleOperate {
	Prev, //上一个角色
	Next, //下一个角色
}

export enum ChatMessageType {
	Emoticon, //表情
	Text, //文字
}

export enum NormalEvents {
	WebSocketConnected = "WebSocketConnected", //ws链接成功
	WebSocketDisconnected = "WebSocketDisconnected", //ws断开
}

export enum MonopolyWebSocketMsgType {
	Connected = 1,
	JoinRoom,
	CreateRoom,
	Step3,
	Error,
}

export enum GameLogLinkItem {
	Player = "Player",
	ChanceCard = "ChanceCard",
	Property = "Property",
	ArrivedEvent = "ArrivedEvent",
}
