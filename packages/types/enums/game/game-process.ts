export enum GamePhaseMark {
	GameRoundStart,

	//多个玩家阶段
	PlayerRoundStart,
	RollDice,
	PlayerMove,
	ArrivedEvent,
	PlayerRoundEnd,

	GameRoundEnd,
}

export enum OperateType {
	GameInitFinished = "GameInitFinished", //前端加载完毕
	RollDice = "RollDice", //前端掷骰子
	UseChanceCard = "UseChanceCard", //使用机会卡
	Animation = "AnimationComplete", //前端动画完成回馈

	MapResourceLoaded = "MapResourceLoaded", //地图资源加载完毕
	LoadingStarted = "LoadingStarted", //客机开始加载地图资源

	PauseGame = "PauseGame", //房主暂停游戏
	ResumeGame = "ResumeGame", //房主恢复游戏

	ConfirmDialogResult = "ConfirmDialogResult", //由服务端主机调起的dialog的结果返回
	TargetSelectDialogResult = "TargetSelectDialogResult", //由服务端主机调起的dialog的结果返回
	ItemSelectDialogResult = "ItemSelectDialogResult", //由服务端主机调起的dialog的结果返回
	/** 表单对话框结果 */
	FormDialogResult = "FormDialogResult",
	/** 动态按钮点击 */
	DynamicButtonClick = "DynamicButtonClick",
	/** 当前玩家提交地图路径选择 */
	ChooseMapPath = "ChooseMapPath",
	/** 安全模式重试 */
	/** 安全模式放弃游戏 */
	SafeModeAbort = "SafeModeAbort",
	/** 安全模式存档并退出 */
	SafeModeSaveAndExit = "SafeModeSaveAndExit",
	/** 地图分块接收确认 */
	MapChunkAck = "MapChunkAck",
}
