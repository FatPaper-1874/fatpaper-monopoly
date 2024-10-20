/*
 Navicat Premium Data Transfer

 Source Server         : fatpaper-dev-mysql
 Source Server Type    : MySQL
 Source Server Version : 80300
 Source Host           : localhost:3306
 Source Schema         : monopoly

 Target Server Type    : MySQL
 Target Server Version : 80300
 File Encoding         : 65001

 Date: 20/10/2024 22:15:13
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for arrived_event
-- ----------------------------
DROP TABLE IF EXISTS `arrived_event`;
CREATE TABLE `arrived_event`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `describe` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `iconUrl` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `effectCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of arrived_event
-- ----------------------------
INSERT INTO `arrived_event` VALUES ('05382484-e271-46ed-954a-54823f3f5447', '成为黑奴', '跳过一回合的行动，之后获得4000块钱', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/9b190ba1b1aaf2d3a0c54a63460607a7.png', 'arrivedPlayer.setStop(1);\r\n	arrivedPlayer.addEventListener(PlayerEvents.BeforeRound, async()=>{\r\n		arrivedPlayer.gain(4000);\r\n	}, 1, {\r\n		name: \"赚辛苦钱\",\r\n		describe: \"因为出卖劳动力挖矿获得4000块钱\",\r\n		source: \"系统\",\r\n	})', '2024-10-19 17:44:47.560247', '2024-10-19 17:44:47.560247');
INSERT INTO `arrived_event` VALUES ('0b3c874a-0090-4bd2-ad78-ff68f05a2621', '只能拉一点点', '被谭警官抓住了，回到成华大道的随机一格', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/c4c62f75f57685c5869d93272049fb34.png', 'await arrivedPlayer.walk(- (() => utils.randomInRange(1, 3))());\r\n	await gameProcess.handleArriveEvent(arrivedPlayer);', '2024-10-20 11:19:08.456851', '2024-10-20 13:15:58.000000');
INSERT INTO `arrived_event` VALUES ('350573c5-7af5-49a8-9949-5b3eea57f93f', '意外之财', '从管理员口袋里掏(2000 * 当前倍率)块钱', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/6a6f158fec301cfa07427861457e2586.png', 'await arrivedPlayer.gain(2000 * gameProcess.currentMultiplier);', '2024-10-17 17:17:11.524212', '2024-10-20 13:12:18.000000');
INSERT INTO `arrived_event` VALUES ('3f85e39d-5910-4fa3-bc26-b29635c5c098', '任意门', '随机传送到地图的某个地方(触发到达事件)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/ca468c4aca6e7d2ff9d56724faf94bf1.png', 'const randomIndex = (() => utils.randomInRange(0, gameProcess.mapInfo.indexList.length - 1))()\r\n	await arrivedPlayer.tp(randomIndex);\r\n	await gameProcess.handleArriveEvent(arrivedPlayer);', '2024-10-20 13:10:21.277318', '2024-10-20 13:10:21.277318');
INSERT INTO `arrived_event` VALUES ('749bae19-4f4a-420b-94ba-b0eb3932504a', '末地的馈赠', '随机获得一张卡片', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/492e0952c735604cefb82a175501fb13.png', 'arrivedPlayer.gainCard(gameProcess.getRandomChanceCard(1)[0]);', '2024-10-17 17:17:11.524212', '2024-10-19 03:35:51.000000');
INSERT INTO `arrived_event` VALUES ('7748876a-1a5f-4bbe-ba96-242fbb19198a', '哇！是公园', '来都来了，睡一会（暂停一个回合）', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/89d2e7cc2ad186f2424f575b0b7f016a.png', 'arrivedPlayer.setStop(1);', '2024-10-17 17:17:11.524212', '2024-10-20 13:13:13.000000');
INSERT INTO `arrived_event` VALUES ('ad81242c-77fd-48f1-9eff-073a47716e6e', '次元之镜', '你走出镜之迷宫了吗...真的吗...(反向移动3个回合)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/60c5a886a14a2db4db63bc5760258126.png', 'arrivedPlayer.addEventListener(PlayerEvents.BeforeWalk, (walk) => {\r\n		return -walk;\r\n	}, 3, {\r\n		name: \"晕头转向\",\r\n		describe: \"向相反的方向移动\",\r\n		source: \"系统-次元之镜\"\r\n	})', '2024-10-20 13:02:56.697565', '2024-10-20 13:02:56.697565');
INSERT INTO `arrived_event` VALUES ('d0484a28-75c9-4b16-9058-fbb586962526', '前面有免费鸡蛋', '踩到的玩家看到前面有免费的鸡蛋，不由自主地往前进1~3步', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/7281a6babe870c9df060500f8d2db579.png', 'await arrivedPlayer.walk((() => utils.randomInRange(1, 3))());\r\n	await gameProcess.handleArriveEvent(arrivedPlayer);', '2024-10-17 17:17:11.524212', '2024-10-20 13:12:59.000000');
INSERT INTO `arrived_event` VALUES ('f1476eef-f5a3-4097-b7fe-98651fed9ef6', '洗牌', '踩到此格子的玩家会失去所有机会卡，然后获得等量的随机新机会卡', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/d3b397e42a7436dbb69432346fb28052.png', 'const num = arrivedPlayer.getCardsList().length;\r\n	await arrivedPlayer.setCardsList(gameProcess.getRandomChanceCard(num));', '2024-10-17 17:17:11.524212', '2024-10-20 13:17:40.000000');

-- ----------------------------
-- Table structure for chance_card
-- ----------------------------
DROP TABLE IF EXISTS `chance_card`;
CREATE TABLE `chance_card`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `describe` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `color` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `effectCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of chance_card
-- ----------------------------
INSERT INTO `chance_card` VALUES ('07741b66-1507-47c6-8c6a-bff020d94089', '你的名字?', '和目标交换位置(均触发到达效果)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/3acf8ee5af1c6f7cb770e3a12f00f46e.png', 'rgb(231, 213, 120)', 'ToOtherPlayer', 'const sourcePositionIndex = sourcePlayer.getPositionIndex();\r\n	await sourcePlayer.tp(target.getPositionIndex());\r\n	await gameProcess.handleArriveEvent(sourcePlayer);\r\n	await target.tp(sourcePositionIndex);\r\n	await gameProcess.handleArriveEvent(target);', '2024-10-17 17:17:11.880036', '2024-10-20 12:45:25.000000');
INSERT INTO `chance_card` VALUES ('0b2fa6b4-6bd3-46d9-98a0-85419ae57c90', '附魔金苹果', '使目标的下三个回合开始时获得2000块钱, 下一次花钱减少30%', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/759b9b76f103e0f562a5a9f876da8e74.png', 'rgb(235, 205, 67)', 'ToPlayer', 'target.addEventListener(PlayerEvents.BeforeRound, async () => {\r\n		target.gain(2000);\r\n	}, 3, {\r\n		name: \"生命恢复 II\",\r\n		describe: \"回合开始时获得2000块钱\",\r\n		source: `${sourcePlayer.getName()}的 附魔金苹果`,\r\n	})\r\n\r\n	target.addEventListener(PlayerEvents.BeforeCost, (cost) => {\r\n		return cost * 0.5;\r\n	}, 1, {\r\n		name: \"抗性提升 I\",\r\n		describe: \"花钱时优惠30%\",\r\n		source: `${sourcePlayer.getName()}的 附魔金苹果`,\r\n	})', '2024-10-19 18:03:39.659647', '2024-10-19 18:06:46.000000');
INSERT INTO `chance_card` VALUES ('0df44579-bc4a-4632-82df-2f3eddc1662d', '/tp', '传送到目标玩家的脚边', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/eb824db3c1942345b636dbeef574ba27.png', 'rgb(213, 57, 231)', 'ToOtherPlayer', 'await sourcePlayer.tp(target.getPositionIndex());\r\n	await gameProcess.handleArriveEvent(sourcePlayer);', '2024-10-17 17:17:11.880036', '2024-10-17 17:17:11.982482');
INSERT INTO `chance_card` VALUES ('21aedbd8-4b21-4958-9814-393bb6ba8839', '倒霉倒霉倒霉', '使目标在花钱时会向前随机移动1-3格, 生效三次', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/b76788cd3c4867ef99c540686e8e440b.png', 'rgb(17, 131, 31)', 'ToOtherPlayer', 'target.addEventListener(PlayerEvents.AfterCost, async () => {\r\n		await target.walk((() => utils.randomInRange(1, 3))());\r\n		await gameProcess.handleArriveEvent(target);\r\n	}, 3, {\r\n		name: \"倒霉倒霉倒霉\",\r\n		describe: \"在花钱时会向前随机移动1-3格\",\r\n		source: `${sourcePlayer.getName()} 的 \"倒霉倒霉倒霉\"`\r\n	})', '2024-10-20 07:47:01.817323', '2024-10-20 09:09:15.000000');
INSERT INTO `chance_card` VALUES ('38ecd9c8-2352-49a4-920f-a4afd2865b09', '这是我的地', '抢夺目标房屋的拥有权', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/78b158809e6bc69ffc7fac8b7368bb62.png', 'rgb(249, 5, 5)', 'ToProperty', 'await target.setOwner(sourcePlayer);', '2024-10-17 17:17:11.880036', '2024-10-20 13:22:10.000000');
INSERT INTO `chance_card` VALUES ('485d39b0-184f-4eb9-8e52-91fd25510332', '保护V', '使目标的下三次花钱减少50%', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/48f38379193c9919e05830b1476d5054.png', 'rgb(70, 61, 62)', 'ToPlayer', 'target.addEventListener(PlayerEvents.BeforeCost, (cost)=>{\r\n		return cost * 0.5\r\n	}, 3, {\r\n		name:\"穿上下界合金胸甲!\",\r\n		describe: \"下界合金胸甲保护着你，下次花钱减少50%\",\r\n		source: sourcePlayer.getName(),\r\n	})', '2024-10-19 17:57:37.494848', '2024-10-19 17:57:37.494848');
INSERT INTO `chance_card` VALUES ('52e77939-0d18-49f5-bd47-cce1089c0bb4', '没事走两步', '让目标人物向前走两步', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/314afd20dabdbfc0316bc558c68bb35f.png', 'rgb(19, 82, 227)', 'ToPlayer', 'await target.walk(2);\r\n	await gameProcess.handleArriveEvent(target);', '2024-10-17 17:17:11.880036', '2024-10-17 17:17:11.982482');
INSERT INTO `chance_card` VALUES ('6a4ddac7-cf1c-403a-bf5a-5d26f3c2910b', '施舍', '给目标1块钱, 让目标再触发一次脚下的到达事件（you bad bad）', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/bb9f5a3eafcf98f062d57948c59c4051.png', 'rgb(253, 181, 21)', 'ToOtherPlayer', 'await sourcePlayer.cost(1);\r\n	await target.gain(1);\r\n	await gameProcess.handleArriveEvent(target);', '2024-10-17 17:17:11.880036', '2024-10-20 12:50:02.000000');
INSERT INTO `chance_card` VALUES ('6e003cb8-1f01-438a-b3b0-3616dc637b69', '美西螈保佑你', '可爱的美西螈会保佑你, 下次花钱时免费', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/ca3cf545c0dc1d3c0883c5ac6fd6cf52.png', 'rgb(242, 112, 147)', 'ToSelf', 'target.addEventListener(PlayerEvents.BeforeCost, ()=>{\r\n		return 0;\r\n	}, 1 , {\r\n		name: \"美西螈保佑你\",\r\n		describe: \"可爱的美西螈会保佑你, 下次花钱时免费\",\r\n		source: `${sourcePlayer.getName()} 的 机会卡\"美西螈保佑你\"`\r\n	})', '2024-10-20 09:05:43.013207', '2024-10-20 09:05:43.013207');
INSERT INTO `chance_card` VALUES ('706dcb77-2180-4940-ae30-f8cd89eb11c4', '中奖啦!!!', '从管理员的钱包里拿到了(2000 * 当前倍率) 块钱', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/77858df095ce198049c617618e4b57d8.png', 'rgb(231, 195, 57)', 'ToSelf', 'await sourcePlayer.gain(2000 * gameProcess.currentMultiplier);', '2024-10-17 17:17:11.880036', '2024-10-20 13:19:55.000000');
INSERT INTO `chance_card` VALUES ('7670dba2-d980-408e-8663-fe81077cab58', 'PUA', 'PUA一名玩家, 让他给你(2000 * 当前倍率) 块钱', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/0a856f5402f568c00ab8ed9d5b485a72.png', 'rgb(46, 222, 58)', 'ToOtherPlayer', 'await target.cost(2000 * gameProcess.currentMultiplier);\r\n	await sourcePlayer.gain(2000 * gameProcess.currentMultiplier);', '2024-10-17 17:17:11.880036', '2024-10-20 13:21:00.000000');
INSERT INTO `chance_card` VALUES ('7ab0bd8c-ad3e-4340-b92d-e697fd4ec93f', '不死图腾', '使目标免疫一次破产并使金钱回溯到2000元', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/b5d442d11b0454e08e9f23fa30ee9011.png', 'rgb(209, 167, 93)', 'ToPlayer', 'target.addEventListener(PlayerEvents.BeforeSetBankrupted, () => {\r\n		target.setMoney(2000);\r\n		return false;\r\n	}, 1, {\r\n		name: \"不死图腾\",\r\n		describe: \"免疫一次破产并使金钱回溯到2000元\",\r\n		source: sourcePlayer.getName(),\r\n	})', '2024-10-19 17:27:14.855077', '2024-10-19 17:28:12.000000');
INSERT INTO `chance_card` VALUES ('7c2a7708-2f3d-46af-8513-5aa8524219c6', 'Build Up!', '提升目标建筑一个等级', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/73403b115c4be181e7fb99bb3f592531.png', 'rgb(155, 233, 48)', 'ToProperty', 'if (target.getBuildingLevel() >= 2) throw Error(\'这个建筑已经是最高级别的啦\');\r\n	target.setBuildingLevel(target.getBuildingLevel() + 1 as 0 | 1 | 2);', '2024-10-17 17:17:11.880036', '2024-10-19 17:50:45.000000');
INSERT INTO `chance_card` VALUES ('88b845be-1f75-4199-8472-2ac9d383d563', '立刻拆迁', '降低目标建筑一个等级', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/5a71bcaacfadf84e88d86e5745c05550.png', 'rgb(233, 49, 49)', 'ToProperty', 'if (target.getBuildingLevel() === 0) throw Error(\"已经是最低级的建筑了，放过孩子吧\")\r\n	target.setBuildingLevel(target.getBuildingLevel() - 1 as 0 | 1 | 2);', '2024-10-17 17:17:11.880036', '2024-10-19 17:51:05.000000');
INSERT INTO `chance_card` VALUES ('9014b91a-acf6-4384-afed-86495ea00bd9', '小睡一下', '让目标玩家跳过一个回合', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/d5711c8d2126746a1c90c1d0f4614349.png', 'rgb(46, 124, 222)', 'ToOtherPlayer', 'target.setStop(1);', '2024-10-17 17:17:11.880036', '2024-10-19 17:48:57.000000');
INSERT INTO `chance_card` VALUES ('9df62118-00d2-44d8-966e-9e27f09567b1', '太空步', '使目标走向前走两步, 再向后走四步 (均触发到达效果)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/74c5604129f90147360724976881b545.png', 'rgb(0, 0, 0)', 'ToPlayer', 'await target.walk(2);\r\n	await gameProcess.handleArriveEvent(target);\r\n	await target.walk(-4);\r\n	await gameProcess.handleArriveEvent(target);', '2024-10-20 12:43:29.198845', '2024-10-20 12:44:16.000000');
INSERT INTO `chance_card` VALUES ('abd2fe5a-0cc5-435e-bcac-1335e51150e8', '灵能窥探', '复制目标手中的一张机会卡, 并将其置入你的手中', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/8dc8146188a89e489a9258f14d099ff1.png', 'rgb(198, 58, 227)', 'ToOtherPlayer', 'const targetCardList = target.getCardsList();\r\n	if (sourcePlayer.getCardsList().length >= 4)\r\n		throw Error(\"你的机会卡满了, 不能使用\");\r\n	if (targetCardList.length > 0) {\r\n		const cardDBId = targetCardList[(() => utils.randomInRange(0, targetCardList.length - 1))()].getSourceId();\r\n		await sourcePlayer.gainCard(gameProcess.getNewChanceCard(cardDBId));\r\n	} else {\r\n		throw Error(\"对方光秃秃的, 啥也没有\");\r\n	}', '2024-10-20 12:12:40.817094', '2024-10-20 12:39:09.000000');
INSERT INTO `chance_card` VALUES ('b5f37262-f465-487a-97a7-135d933998c7', '酒肉朋友', '和目标成为酒肉朋友, 有福同享... 后面没有了(目标的下一次收入30%会到你的账上)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/b63c4230e47cf221a1203cedde86a1e5.png', 'rgb(80, 200, 52)', 'ToOtherPlayer', 'target.addEventListener(PlayerEvents.BeforeGain, async (targetGain) => {\r\n		await sourcePlayer.gain(targetGain * 0.3);\r\n		return targetGain * 0.7;\r\n	}, 1, {\r\n		name: \"被有福同享\",\r\n		describe: `你的下一次收入的30%会进入 ${sourcePlayer.getName()} 的口袋`,\r\n		source: `${sourcePlayer.getName()} 的机会卡 \"酒肉朋友\"`\r\n	})', '2024-10-20 11:50:43.748671', '2024-10-20 12:44:35.000000');

-- ----------------------------
-- Table structure for game_record
-- ----------------------------
DROP TABLE IF EXISTS `game_record`;
CREATE TABLE `game_record`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `duration` int NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`, `name`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of game_record
-- ----------------------------
INSERT INTO `game_record` VALUES ('2ea57e86-c419-44ed-9bbf-c882e21fd4a9', '放放风', 193369, '2024-10-20 09:31:07.061352', '2024-10-20 09:31:07.061352');

-- ----------------------------
-- Table structure for item_type
-- ----------------------------
DROP TABLE IF EXISTS `item_type`;
CREATE TABLE `item_type`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `color` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `size` int NOT NULL,
  `modelId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_02335a3ca1f71795334f32e6c8d`(`modelId` ASC) USING BTREE,
  INDEX `IDX_02335a3ca1f71795334f32e6c8`(`modelId` ASC) USING BTREE,
  CONSTRAINT `FK_02335a3ca1f71795334f32e6c8d` FOREIGN KEY (`modelId`) REFERENCES `model` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of item_type
-- ----------------------------
INSERT INTO `item_type` VALUES ('0462ea20-73ad-4ee9-85f5-772980ac344b', '#B70404', 'r1', 1, '95af5c8f-49ec-43d9-829d-3729df34c722', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('06325d8e-8bb1-4f41-b24a-61b0f73a1723', '#748b80', 'city_道路-1', 1, '1decba8f-994a-419e-8883-60efce68a34d', '2024-10-19 10:56:48.966613', '2024-10-19 10:56:48.966613');
INSERT INTO `item_type` VALUES ('0a51f019-7ea8-4915-9b43-daad1a9e9ff3', '#2a94d5', 'city_装饰_8', 1, '23a3758d-685f-4363-9f23-8cc82bdb539f', '2024-10-19 15:14:13.294062', '2024-10-19 15:14:13.294062');
INSERT INTO `item_type` VALUES ('17c59746-eb39-4d41-99af-da55342c5225', '#73916e', 'city_道路-3', 1, 'd48dc14e-f9e4-47cb-abcc-b055373d5df6', '2024-10-19 10:56:55.845615', '2024-10-19 10:56:55.845615');
INSERT INTO `item_type` VALUES ('18e11a2f-876a-41d4-8b00-ea241e12b7cb', '#acf1e', 'city_装饰_7', 1, 'ac805431-be1f-48dc-a82a-cce4e86c5246', '2024-10-19 15:14:10.859926', '2024-10-19 15:14:10.859926');
INSERT INTO `item_type` VALUES ('1c808dd7-b050-4273-9d72-deb060f2f6d1', '#59a669', '道路-3', 1, 'cffe922d-5364-45c4-a09f-f28d2c2bdd3c', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('1ccdd87c-38e4-43f0-869a-b5feefe18dba', '#3d39c6', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('201873e1-d77e-4513-9d1f-e569c7a385c7', '#eacf15', '道路-2', 1, '95af5c8f-49ec-43d9-829d-3729df34c722', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('2637e350-461b-4c73-b564-a4aae61632b5', '#7bcf30', '装饰-4', 1, '9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('2ed9f123-4c4b-47da-b020-b8d92403b29e', '#BE1717', 'r1', 1, '95af5c8f-49ec-43d9-829d-3729df34c722', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('30089c21-6554-498e-a9ad-58d5d0e1fa62', '#26d967', 'city_装饰_2', 1, '9e369c99-df1a-463e-88fb-856314d94b0a', '2024-10-19 10:57:06.274755', '2024-10-19 10:57:06.274755');
INSERT INTO `item_type` VALUES ('39625035-293f-4c80-83b3-1310488b7583', '#D92222', 'p', 1, '95af5c8f-49ec-43d9-829d-3729df34c722', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('3cc95bf0-d8d0-48bd-934e-fff5b36e12c4', '#6c8f7', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b', '2024-10-17 17:33:17.391501', '2024-10-17 17:33:17.391501');
INSERT INTO `item_type` VALUES ('4327fa46-94ae-43a7-bbec-dd84206fa015', '#2bf0f', 'city_装饰_6', 1, 'a71a79fd-6b4a-4c11-a068-fd2669524546', '2024-10-19 15:14:07.847363', '2024-10-19 15:14:07.847363');
INSERT INTO `item_type` VALUES ('43db44ab-d856-472c-bee8-5e76dd4117c7', '#b24da5', 'city_装饰_3', 1, '9b8f555d-462c-4636-9d51-657ba6ac1e27', '2024-10-19 10:57:09.487813', '2024-10-19 10:57:09.487813');
INSERT INTO `item_type` VALUES ('51bb9900-bb69-459a-ba1d-526836938edc', '#c93a36', 'city_道路-4', 1, '7fefdf2c-e532-47d5-8e6c-ef713cd25ae7', '2024-10-19 10:56:58.802540', '2024-10-19 10:56:58.802540');
INSERT INTO `item_type` VALUES ('53c18321-82a8-4b50-8efb-f067920eb5da', '#47b8b7', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('53df1f44-e0c1-45dd-9e98-4f7395bb2f69', '#7426d9', '道路-2', 1, '95af5c8f-49ec-43d9-829d-3729df34c722', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('670df220-ccd5-44e9-a969-f2b337026615', '#3300FF', 'r4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('7ff0f290-ada2-4c45-a174-109daf72fd03', '#d621de', 'city_道路-2', 1, '5058e570-c891-4172-9390-7fc719a0ab8d', '2024-10-19 10:56:52.942387', '2024-10-19 10:56:52.942387');
INSERT INTO `item_type` VALUES ('81bbd488-deab-4de5-b47c-a284171dd456', '#ac5390', '道路-1', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('8d26668d-17b7-4cc8-a437-00874f1146ba', '#27d8cb', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:33:00.124396', '2024-10-17 17:33:00.124396');
INSERT INTO `item_type` VALUES ('907b7e87-45f1-44ec-b582-1de9f1b65baf', '#58ca35', 'village_装饰-2', 1, '67f70702-2ea0-4793-b12a-28fc9cd934a9', '2024-10-19 15:40:32.123746', '2024-10-19 15:40:32.123746');
INSERT INTO `item_type` VALUES ('959dc759-96aa-491d-8d0d-54a41e950ce6', '#d42bc8', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('99a8eea3-ad70-4115-b3a5-05e867424a6f', '#047BB7', 'r2', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('9e04728f-dec5-48f2-87af-2f544179fa52', '#2dde21', 'village_装饰-1', 1, '450af6ab-3fb3-4584-9d3f-6418121af172', '2024-10-19 15:16:31.888371', '2024-10-19 15:16:31.888371');
INSERT INTO `item_type` VALUES ('9e0ceef0-43a1-4991-b445-d341ae7429a7', '#9c636d', '装饰-3', 1, 'b7b9aed2-4f37-4e5c-96a4-6439d47d5779', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('9f1ef778-8a82-493a-a8c6-879c582d6114', '#951B1B', '装饰1', 1, '450af6ab-3fb3-4584-9d3f-6418121af172', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('a6f52c20-2f71-4e70-9aa3-e37d263e4719', '#5f42bd', '装饰-1', 1, '450af6ab-3fb3-4584-9d3f-6418121af172', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('a7642d4c-f901-465d-861b-1c4fab3f7950', '#0DFF00', 'r5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('a9120114-7eff-45a1-8061-b8faed17bf27', '#b26f4d', 'city_装饰_5', 1, '29078571-fab3-40f1-89de-340e18ebd201', '2024-10-19 10:57:14.995865', '2024-10-19 10:57:14.995865');
INSERT INTO `item_type` VALUES ('ac164ee0-d517-4154-aa30-29728405aa48', '#CC42FF', '装饰4', 1, '9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('ac9c2c87-38e2-4876-a4d5-d4d854228020', '#a9b847', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('acda5889-08ce-4d34-a6e6-f02ea27cba9d', '#1B6695', '装饰2', 1, '67f70702-2ea0-4793-b12a-28fc9cd934a9', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('b0d48be1-9f24-4f8b-b808-8705d02422a7', '#fd23a', 'village_装饰-3', 1, 'b7b9aed2-4f37-4e5c-96a4-6439d47d5779', '2024-10-19 15:17:10.649021', '2024-10-19 15:17:10.649021');
INSERT INTO `item_type` VALUES ('b19a208b-b82a-4120-8dfc-f58469b026f3', '#209edf', '道路-1', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('b853881d-3ff5-452e-88d0-c2ff3da16b9f', '#4b93b4', 'city_装饰_1', 1, '12647fda-6496-4305-bcaa-03f3ac68f446', '2024-10-19 10:57:02.915708', '2024-10-19 10:57:02.915708');
INSERT INTO `item_type` VALUES ('ba3de769-de9a-411e-8162-feffd50e8ab1', '#ad5290', '装饰-2', 1, '67f70702-2ea0-4793-b12a-28fc9cd934a9', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('bbe096ab-7bae-416e-9e1f-354eaef53f66', '#B81F1F', '传送门', 1, '38ec0bd7-f774-4425-a28c-944069363dee', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('bbf2476f-0570-4809-8663-13492d31444b', '#ac538e', 'city_装饰_4', 1, '25a0f0a4-dff3-4815-8974-e20b4fe1f4d6', '2024-10-19 10:57:12.544809', '2024-10-19 10:57:12.544809');
INSERT INTO `item_type` VALUES ('bda18871-1d91-4b91-8ee2-55bca3a7a907', '#4dbb44', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('cd6dfa2f-202d-4a90-a037-1b855f1a742a', '#300FD3', 'test', 1, '38ec0bd7-f774-4425-a28c-944069363dee', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('e1cb701f-33b0-4de8-8f64-fa03e00484a8', '#9d20df', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('e3f15ae1-6663-4ec2-a607-e4fa20eb248b', '#2599E1', '装饰3', 1, 'b7b9aed2-4f37-4e5c-96a4-6439d47d5779', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('e666e548-dcdf-4335-9c4e-9a73008de34c', '#0048FF', 'r3', 1, 'cffe922d-5364-45c4-a09f-f28d2c2bdd3c', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('f3450d27-3991-4b09-8042-8046a40849f4', '#8617BE', 'r2', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');
INSERT INTO `item_type` VALUES ('f5957d38-9667-4f99-9090-650b4cc59bab', '#8d7f72', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78', '2024-10-17 17:17:12.590186', '2024-10-17 17:17:12.647167');

-- ----------------------------
-- Table structure for itemtype_map
-- ----------------------------
DROP TABLE IF EXISTS `itemtype_map`;
CREATE TABLE `itemtype_map`  (
  `itemTypeId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`itemTypeId`, `mapId`) USING BTREE,
  INDEX `IDX_3114223833b3d4c6c12c2c1d56`(`itemTypeId` ASC) USING BTREE,
  INDEX `IDX_9a589f2c651427612b08f7175e`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_3114223833b3d4c6c12c2c1d561` FOREIGN KEY (`itemTypeId`) REFERENCES `item_type` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_9a589f2c651427612b08f7175e9` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of itemtype_map
-- ----------------------------
INSERT INTO `itemtype_map` VALUES ('06325d8e-8bb1-4f41-b24a-61b0f73a1723', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('0a51f019-7ea8-4915-9b43-daad1a9e9ff3', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('17c59746-eb39-4d41-99af-da55342c5225', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('18e11a2f-876a-41d4-8b00-ea241e12b7cb', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('1c808dd7-b050-4273-9d72-deb060f2f6d1', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('201873e1-d77e-4513-9d1f-e569c7a385c7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('2637e350-461b-4c73-b564-a4aae61632b5', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('30089c21-6554-498e-a9ad-58d5d0e1fa62', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('4327fa46-94ae-43a7-bbec-dd84206fa015', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('43db44ab-d856-472c-bee8-5e76dd4117c7', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('51bb9900-bb69-459a-ba1d-526836938edc', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('53c18321-82a8-4b50-8efb-f067920eb5da', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('7ff0f290-ada2-4c45-a174-109daf72fd03', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('907b7e87-45f1-44ec-b582-1de9f1b65baf', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('9e04728f-dec5-48f2-87af-2f544179fa52', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('9e0ceef0-43a1-4991-b445-d341ae7429a7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('a6f52c20-2f71-4e70-9aa3-e37d263e4719', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('a9120114-7eff-45a1-8061-b8faed17bf27', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('b0d48be1-9f24-4f8b-b808-8705d02422a7', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('b19a208b-b82a-4120-8dfc-f58469b026f3', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('b853881d-3ff5-452e-88d0-c2ff3da16b9f', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('ba3de769-de9a-411e-8162-feffd50e8ab1', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('bbe096ab-7bae-416e-9e1f-354eaef53f66', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('bbf2476f-0570-4809-8663-13492d31444b', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `itemtype_map` VALUES ('cd6dfa2f-202d-4a90-a037-1b855f1a742a', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('e1cb701f-33b0-4de8-8f64-fa03e00484a8', 'd01a06c2-fef1-4350-bcc3-986e44325275');

-- ----------------------------
-- Table structure for map
-- ----------------------------
DROP TABLE IF EXISTS `map`;
CREATE TABLE `map`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `background` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `indexList` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `inUse` tinyint NOT NULL DEFAULT 0,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `houseModelLv0Id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `houseModelLv1Id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `houseModelLv2Id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_0487a4beeaaae3641a6421c6e1f`(`houseModelLv0Id` ASC) USING BTREE,
  INDEX `FK_8f17ecf7c97e88b435d9bf5fb55`(`houseModelLv1Id` ASC) USING BTREE,
  INDEX `FK_77843df290c14d02b52204788e2`(`houseModelLv2Id` ASC) USING BTREE,
  CONSTRAINT `FK_0487a4beeaaae3641a6421c6e1f` FOREIGN KEY (`houseModelLv0Id`) REFERENCES `model` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `FK_77843df290c14d02b52204788e2` FOREIGN KEY (`houseModelLv2Id`) REFERENCES `model` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `FK_8f17ecf7c97e88b435d9bf5fb55` FOREIGN KEY (`houseModelLv1Id`) REFERENCES `model` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of map
-- ----------------------------
INSERT INTO `map` VALUES ('65791190-c8cb-4947-8201-5d5c18d26384', '小镇富翁', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/backgrounds/5384c09ef05022e8383d07ea19f66b39.png', '01560256-a6fc-47a2-a78e-af82af466abc,17d1fbad-299b-4ade-be86-bf009cacfeda,634cbd00-56da-4ea2-b23c-959903551cc7,dc229d1d-f713-451d-8dd1-a75818e61047,760e1a2b-b795-4682-a2f7-cab7920b0fe1,b02d80bc-fe96-460a-8417-1650648a6ade,a34fa520-319e-4fa8-8bba-a3e2903f16f6,aaa02c71-3c2d-473b-bcd0-f24743ca1408,479f71a9-cffb-4817-9668-517cec9163c9,420ba5a7-86b9-47f9-813f-5fed8e1e5c12,87999200-6207-47e9-af1a-98cd7e93aaf6,971ba301-aa00-448c-bb5f-f1008515529a,68bd3c89-e202-4565-83c4-e07dabde426d,de947a62-0a66-4a7e-a83c-1a5581a89d9f,76c730f5-619e-453a-927f-cc2eca0766a9,0f9743be-2c6e-4ba0-8432-cb13d96ba576,bf2d48a9-7dfa-4f29-8daf-25d2aa20c058,8d5ccc35-eda8-40c5-b700-5be29a526164,138700a5-66b2-4b8d-bd58-4bc892ddcf00,49dca4ce-5796-4dd0-af73-aae616ab294e,b17ec710-9a01-45ca-83d0-56f862c1a166,d3b5884a-f041-4c28-849e-8d1dd397c30e,c4af3e78-a675-4d0f-8333-d8b82a04cc89,ea7891d3-7afc-4313-a105-ff30da885259,39e04177-b91d-4b44-a6dc-1a832ddaca6f,8940e7c5-5ad1-4eb7-9aa9-a00ec27a9b71,1f5754b8-4ac6-4cab-b3eb-485210f5c4f6,4eb7ce0b-7e6f-4619-af1a-8081456455a9,cdd6c0fc-b8bc-409f-ab2b-93fa77346131,33a04f8d-ed61-4550-98a1-83b6a19f142c,69ba4eb4-a218-4a91-8e10-12af73debd5b,fe506c09-a41f-4dbe-8fed-d54d53e32649,20cde37e-7169-4b8b-8b74-e6694ee6ae3d,3cbdcf30-6c22-4745-bd84-ae4996ee2939,d5b72216-35ed-44b4-b5c7-d4ef091d43e7,ac1e753d-8a03-48b7-9667-4f4886344769,7034aa50-94c6-4813-9258-09e5c09ec513,7cc52cc4-aea1-4078-95c0-c365f05ea915,2c090bea-9cd4-4961-907f-e8aff8b3b79f,9ff283c2-6475-475f-96d3-fec932016a67,c25de415-9b99-4119-8267-a182813a303a,59d68f04-d825-446f-8d29-68ab30b1aa57,67760f1a-ea66-48b1-9592-f0d3a1b604c6,7afe1928-7fea-4bfa-a2d3-5798c8d77739,0b1a3256-74b7-4dda-a5eb-542bccfe1909,5d865bad-a885-4c85-92d9-129b590a095d,b765aac3-77e4-48a4-9ce5-241b115a351a,7da69489-ce49-45ae-ae8a-6f7df5aab9c4,2b92552f-433e-432c-8a21-e8d3016397b7,c712496e-8b20-4949-a8b0-e9d706f8e5c3,112faed5-d023-4980-a4f0-c0a91e3fcc2d,0efdd2d2-dc5f-480a-b569-a87ef8dcd78b,fe122837-937b-4a24-8fb9-858d3d20bebd,dfa0b756-3a9e-43ef-850f-8f4acf5fde24,08c917e7-a41f-4963-ae89-f8618bea23bc,f69496bf-7372-4a76-b5db-13cdeec7223d,c9728e70-1ea7-4ed7-9fc5-6e024242cbdd,0e4734fe-a95c-4220-be77-4a6225f0a0f1,70c9ff53-35c1-4fd1-9b12-b7ce9de9a4f0,855e3d5a-cf02-46d6-9a21-9f4a9c2591b9,4ed1d71d-0653-429a-a2cc-6ffb5ce2fded,99093f05-ea84-4b2a-b30e-c9decf139e11,2d3c557d-ae66-4caf-b584-c69239bab2e6,8e34a11a-8c76-4ad6-bf07-42793e1f7534', 1, '2024-10-19 10:56:25.624587', '2024-10-20 13:22:58.000000', 'bcb2e19a-e79f-4d16-baa4-f08c7d5a254a', '57dfac25-a496-4752-ac61-036832e94e9e', '4fa1dde6-aadd-4a0f-97b0-37c352146f13');
INSERT INTO `map` VALUES ('d01a06c2-fef1-4350-bcc3-986e44325275', '乡村小富翁', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/backgrounds/c22d43b35c4b7a8e45cf0071c90fb984.png', '00cbff62-a2a4-4e61-bbf1-8de5ffcb15eb,592b3390-965a-49f4-bbf7-90397f998a2b,bd025854-8469-4884-8610-c150e23fd60f,34b8fcc8-d844-4137-b8b8-249fd27305bc,73955878-65b8-469a-83a6-b11b9e1316ff,62378ae8-84fd-4a74-ab26-6dd80bc8c17a,de7513db-2ab3-4c6a-b3bc-efc82dad4887,dbbf6660-d819-4b46-b3b6-039096d3cce6,b0ae9eed-82c8-4099-8f2e-329057c97d0a,26f3d819-4c1c-451f-8be3-01637a2ccbdc,17ce549c-b147-4767-8522-58f7292dd6ac,883956d4-2555-4ea3-992e-72ea11f2cf33,d184a4e2-d51c-468e-b33f-ead8893d20d1,73c6cca5-f0e8-4a5a-a5f7-ad1b2002b864,b5d01feb-df22-4900-a211-7d0ad3d9b4cd,e1f83499-77ee-4294-bc65-db3bd76ea8da,5a1b3cf2-db50-43ed-90fd-071cc0bc5ee1,09deb52a-0d9f-471c-ba23-c80c3555b1b6,350e9f9c-bd1f-4541-8958-57cb1d418d30,b27c2da7-eb49-4faa-a915-c65cde4bf4a1,565d43e4-5651-425e-bcfe-37932af19148,e8e3d876-d170-4bee-9023-e9d0b732141e,aa72b756-12cf-45e8-b4ab-6e590df50c6a,7670fe69-8f1a-472a-90ab-690339ef2ac2,36c3f113-36ab-49cd-96b9-975ccf78ee7d,94ec114f-e27b-4d95-9440-333ca933e6bc,b7df6027-493a-4801-84aa-5cb53ec43451,80809339-7ba8-4d0e-9a5e-98250f74625b', 0, '2024-10-17 17:17:12.193864', '2024-10-17 18:01:48.000000', '9984b8d5-f050-4a68-8e68-426c1aa58882', '44c57047-a428-4f9f-bd02-a9bb04dff564', 'bc32f530-a841-4062-9ff9-3e18f1b6def4');

-- ----------------------------
-- Table structure for map_chance_card
-- ----------------------------
DROP TABLE IF EXISTS `map_chance_card`;
CREATE TABLE `map_chance_card`  (
  `chanceCardId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`chanceCardId`, `mapId`) USING BTREE,
  INDEX `IDX_87edf97a1042e3990dbfcc5dc7`(`chanceCardId` ASC) USING BTREE,
  INDEX `IDX_fe834c5cd239e84df3fef3b29c`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_87edf97a1042e3990dbfcc5dc7c` FOREIGN KEY (`chanceCardId`) REFERENCES `chance_card` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_fe834c5cd239e84df3fef3b29c9` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of map_chance_card
-- ----------------------------
INSERT INTO `map_chance_card` VALUES ('07741b66-1507-47c6-8c6a-bff020d94089', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('07741b66-1507-47c6-8c6a-bff020d94089', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('0b2fa6b4-6bd3-46d9-98a0-85419ae57c90', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('0df44579-bc4a-4632-82df-2f3eddc1662d', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('0df44579-bc4a-4632-82df-2f3eddc1662d', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('21aedbd8-4b21-4958-9814-393bb6ba8839', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('38ecd9c8-2352-49a4-920f-a4afd2865b09', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('485d39b0-184f-4eb9-8e52-91fd25510332', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('52e77939-0d18-49f5-bd47-cce1089c0bb4', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('6a4ddac7-cf1c-403a-bf5a-5d26f3c2910b', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('6e003cb8-1f01-438a-b3b0-3616dc637b69', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('706dcb77-2180-4940-ae30-f8cd89eb11c4', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('706dcb77-2180-4940-ae30-f8cd89eb11c4', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('7670dba2-d980-408e-8663-fe81077cab58', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('7670dba2-d980-408e-8663-fe81077cab58', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('7ab0bd8c-ad3e-4340-b92d-e697fd4ec93f', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('7c2a7708-2f3d-46af-8513-5aa8524219c6', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('7c2a7708-2f3d-46af-8513-5aa8524219c6', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('88b845be-1f75-4199-8472-2ac9d383d563', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('9014b91a-acf6-4384-afed-86495ea00bd9', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('9014b91a-acf6-4384-afed-86495ea00bd9', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('9df62118-00d2-44d8-966e-9e27f09567b1', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('abd2fe5a-0cc5-435e-bcac-1335e51150e8', '65791190-c8cb-4947-8201-5d5c18d26384');
INSERT INTO `map_chance_card` VALUES ('b5f37262-f465-487a-97a7-135d933998c7', '65791190-c8cb-4947-8201-5d5c18d26384');

-- ----------------------------
-- Table structure for map_item
-- ----------------------------
DROP TABLE IF EXISTS `map_item`;
CREATE TABLE `map_item`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `x` int NOT NULL,
  `y` int NOT NULL,
  `rotation` int NOT NULL DEFAULT 0,
  `typeId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `linktoId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `propertyId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `arrivedEventId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `REL_871af6c53eab8923149b9eeb40`(`propertyId` ASC) USING BTREE,
  INDEX `FK_f73ad06dec0392c99615705500c`(`typeId` ASC) USING BTREE,
  INDEX `FK_49e601052131e6153296763f7ee`(`linktoId` ASC) USING BTREE,
  INDEX `FK_b6e5e161770ab9f8831bd7c24aa`(`mapId` ASC) USING BTREE,
  INDEX `FK_bbfcd5ab1dedbe5caa541cba789`(`arrivedEventId` ASC) USING BTREE,
  INDEX `IDX_f73ad06dec0392c99615705500`(`typeId` ASC) USING BTREE,
  INDEX `IDX_49e601052131e6153296763f7e`(`linktoId` ASC) USING BTREE,
  INDEX `IDX_bbfcd5ab1dedbe5caa541cba78`(`arrivedEventId` ASC) USING BTREE,
  INDEX `IDX_b6e5e161770ab9f8831bd7c24a`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_49e601052131e6153296763f7ee` FOREIGN KEY (`linktoId`) REFERENCES `map_item` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `FK_871af6c53eab8923149b9eeb403` FOREIGN KEY (`propertyId`) REFERENCES `property` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_b6e5e161770ab9f8831bd7c24aa` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_bbfcd5ab1dedbe5caa541cba789` FOREIGN KEY (`arrivedEventId`) REFERENCES `arrived_event` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `FK_f73ad06dec0392c99615705500c` FOREIGN KEY (`typeId`) REFERENCES `item_type` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of map_item
-- ----------------------------
INSERT INTO `map_item` VALUES ('00cbff62-a2a4-4e61-bbf1-8de5ffcb15eb', 'item-8-7', 8, 7, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '36126bf7-1b40-497f-b78b-b2fd4e3e9a94', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('01560256-a6fc-47a2-a78e-af82af466abc', 'item-16-7', 16, 7, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'd2e335c6-9432-407a-9ff5-3b0cfa0518ba', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:07.639840', '2024-10-19 11:22:11.000000');
INSERT INTO `map_item` VALUES ('0429496c-a758-43fc-9806-5ae0a6d8138b', 'item-2-3', 2, 3, 3, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:24:46.559815', '2024-10-19 11:24:46.559815');
INSERT INTO `map_item` VALUES ('08c917e7-a41f-4963-ae89-f8618bea23bc', 'item-10-7', 10, 7, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'f90b86dc-ab8b-4570-a688-55df3616a4d1', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:39.044302', '2024-10-19 11:21:48.000000');
INSERT INTO `map_item` VALUES ('09deb52a-0d9f-471c-ba23-c80c3555b1b6', 'item-10-12', 10, 12, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('0b1a3256-74b7-4dda-a5eb-542bccfe1909', 'item-4-3', 4, 3, 2, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '0f6fee07-8d57-4b8d-88a9-48c72b2e39ef', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:20:57.030707', '2024-10-19 11:21:06.000000');
INSERT INTO `map_item` VALUES ('0c3eae9c-62ce-4cfe-898a-879bfe69b92b', 'item-9-6', 9, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '14b53b3f-640b-4671-b1e7-b44c74655cbf', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('0cbbb4c0-a5e6-4228-8a4d-55cd48a2d3c9', 'item-12-8', 12, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '085e51bb-3824-40a5-b0dc-2d45d27841af', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('0e4734fe-a95c-4220-be77-4a6225f0a0f1', 'item-12-6', 12, 6, 3, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '3f85e39d-5910-4fa3-bc26-b29635c5c098', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:01.201211', '2024-10-20 13:11:00.000000');
INSERT INTO `map_item` VALUES ('0e6e0354-88ec-476a-b8fa-bd493bd00a92', 'item-9-13', 9, 13, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('0eca6db6-4cb1-4463-84bf-b439c89d33c2', 'item-6-14', 6, 14, 1, '0a51f019-7ea8-4915-9b43-daad1a9e9ff3', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:39.534337', '2024-10-19 15:15:39.534337');
INSERT INTO `map_item` VALUES ('0efdd2d2-dc5f-480a-b569-a87ef8dcd78b', 'item-8-6', 8, 6, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '81592734-51ef-40b1-b321-3316ef833637', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:28.005987', '2024-10-19 11:21:42.000000');
INSERT INTO `map_item` VALUES ('0f6fee07-8d57-4b8d-88a9-48c72b2e39ef', 'item-4-2', 4, 2, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '57c32853-76ea-4b35-ab7e-f21da844d1f4', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:30.274248', '2024-10-19 15:29:22.000000');
INSERT INTO `map_item` VALUES ('0f9743be-2c6e-4ba0-8432-cb13d96ba576', 'item-16-14', 16, 14, 2, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '7748876a-1a5f-4bbe-ba96-242fbb19198a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:17:48.903190', '2024-10-20 13:13:46.000000');
INSERT INTO `map_item` VALUES ('112faed5-d023-4980-a4f0-c0a91e3fcc2d', 'item-8-5', 8, 5, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '1143931a-2754-4ed0-ae10-6901b1a15e3c', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:26.032395', '2024-10-19 11:21:40.000000');
INSERT INTO `map_item` VALUES ('1143931a-2754-4ed0-ae10-6901b1a15e3c', 'item-9-5', 9, 5, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '12fdec7b-0ab1-4bb2-8be1-d936bd33c388', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:15:43.287799', '2024-10-19 15:32:08.000000');
INSERT INTO `map_item` VALUES ('138700a5-66b2-4b8d-bd58-4bc892ddcf00', 'item-15-16', 15, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'c8b66468-ec42-4a1b-8565-a3aa85030f30', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:26.734261', '2024-10-19 11:22:49.000000');
INSERT INTO `map_item` VALUES ('14f68026-b09f-4b26-a0c7-22ad8c24cbff', 'item-8-11', 8, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'd7bfa59a-bbc3-4a2b-aa7c-e9d01408e1f2', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:05.184008', '2024-10-19 15:25:33.000000');
INSERT INTO `map_item` VALUES ('15e896a8-5295-4abe-aa2d-0bc075b855bd', 'item-17-9', 17, 9, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '50467e4d-ebfa-4771-8b6a-285a9d930dee', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:44.503561', '2024-10-19 16:36:44.000000');
INSERT INTO `map_item` VALUES ('17a055eb-0e42-4174-a0fc-e9be18b1b1a6', 'item-5-9', 5, 9, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '1102ff45-64e1-4e04-a74a-76ca522ca144', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('17ce549c-b147-4767-8522-58f7292dd6ac', 'item-14-11', 14, 11, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '9f2e1c7d-2543-4301-9704-2de822688b1c', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('17d1fbad-299b-4ade-be86-bf009cacfeda', 'item-16-8', 16, 8, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '8110d1db-8ec5-4b79-88bc-2eef24d7c759', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:08.731860', '2024-10-19 11:22:13.000000');
INSERT INTO `map_item` VALUES ('1975cf38-e963-42d8-b7c1-2e841be96b8b', 'item-6-13', 6, 13, 0, '0a51f019-7ea8-4915-9b43-daad1a9e9ff3', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:36.971128', '2024-10-19 15:15:36.971128');
INSERT INTO `map_item` VALUES ('1a3a8656-832b-4796-a51c-95f1af553381', 'item-13-13', 13, 13, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '325d18e3-0ee9-4972-ae5e-024fcb98a87b', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:18.386211', '2024-10-19 15:20:36.000000');
INSERT INTO `map_item` VALUES ('1a69541a-6a9a-4a78-aaa0-fd44a41ad1b2', 'item-10-17', 10, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '4fb266ea-3405-445a-9b0f-2df99431f293', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:11.150807', '2024-10-19 15:24:09.000000');
INSERT INTO `map_item` VALUES ('1c5f299a-43e4-45fc-a8f5-23afca47f52f', 'item-14-15', 14, 15, 3, 'b0d48be1-9f24-4f8b-b808-8705d02422a7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:17:25.588251', '2024-10-19 15:17:25.588251');
INSERT INTO `map_item` VALUES ('1f5754b8-4ac6-4cab-b3eb-485210f5c4f6', 'item-7-16', 7, 16, 0, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:19.043378', '2024-10-20 11:21:37.000000');
INSERT INTO `map_item` VALUES ('20cde37e-7169-4b8b-8b74-e6694ee6ae3d', 'item-7-10', 7, 10, 2, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:17.859677', '2024-10-19 11:18:17.859677');
INSERT INTO `map_item` VALUES ('22ae73f7-f993-43e4-bfc2-a49aa55f82b6', 'item-7-17', 7, 17, 2, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:50.992411', '2024-10-19 15:15:50.992411');
INSERT INTO `map_item` VALUES ('25dc4d2f-77da-4c28-bce1-5ffe0efa8a07', 'item-12-17', 12, 17, 1, '9e04728f-dec5-48f2-87af-2f544179fa52', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:16:36.137407', '2024-10-19 15:16:36.137407');
INSERT INTO `map_item` VALUES ('25ed23f3-4a6b-460d-b632-7573e5ffb003', 'item-13-8', 13, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '9e6bd246-9b1c-4927-8ad4-2d69567eaf27', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('25fd8f93-f54d-4e15-a6fd-4e90ecee44a6', 'item-2-9', 2, 9, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '9e797068-c351-4311-92b3-dbe8d9aaf612', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:12.476860', '2024-10-19 15:28:38.000000');
INSERT INTO `map_item` VALUES ('26f3d819-4c1c-451f-8be3-01637a2ccbdc', 'item-14-10', 14, 10, 1, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'a08451bb-aead-47eb-a063-926d42fb4fd8', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('280024f0-c61e-4e7f-ade7-a8d6ea7acd95', 'item-12-14', 12, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'a261c0fa-bc33-4bc6-be42-89e60c76238a', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('291b824d-bc8a-4973-afed-8225e20b4413', 'item-8-12', 8, 12, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '94355ea6-d8b2-4453-8c7f-01810492c628', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:06.655989', '2024-10-19 15:25:27.000000');
INSERT INTO `map_item` VALUES ('2b8821e4-634c-4888-8410-ea0820d6a775', 'item-12-15', 12, 15, 0, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:16:54.097346', '2024-10-19 15:16:54.097346');
INSERT INTO `map_item` VALUES ('2b92552f-433e-432c-8a21-e8d3016397b7', 'item-8-3', 8, 3, 2, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:03:08.050264', '2024-10-20 13:11:21.000000');
INSERT INTO `map_item` VALUES ('2c090bea-9cd4-4961-907f-e8aff8b3b79f', 'item-3-8', 3, 8, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '3171782d-6ba1-4d47-82fb-0677e748e747', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:31.287996', '2024-10-19 11:21:29.000000');
INSERT INTO `map_item` VALUES ('2d3c557d-ae66-4caf-b584-c69239bab2e6', 'item-16-5', 16, 5, 2, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, 'ad81242c-77fd-48f1-9eff-073a47716e6e', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:11:00.316627', '2024-10-20 13:03:28.000000');
INSERT INTO `map_item` VALUES ('2fef62c2-01c8-4e10-bacd-e6fbfe32becc', 'item-10-14', 10, 14, 1, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('3171782d-6ba1-4d47-82fb-0677e748e747', 'item-2-8', 2, 8, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '23734694-26c8-441a-856f-0b111aa34f61', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:12.954210', '2024-10-19 15:28:44.000000');
INSERT INTO `map_item` VALUES ('320c6ded-1019-4756-bcf8-adc472be4fcc', 'item-6-12', 6, 12, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('33a04f8d-ed61-4550-98a1-83b6a19f142c', 'item-7-13', 7, 13, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '05382484-e271-46ed-954a-54823f3f5447', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:44.124656', '2024-10-19 17:46:00.000000');
INSERT INTO `map_item` VALUES ('34b8fcc8-d844-4137-b8b8-249fd27305bc', 'item-10-8', 10, 8, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '7748876a-1a5f-4bbe-ba96-242fbb19198a', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('350e9f9c-bd1f-4541-8958-57cb1d418d30', 'item-10-11', 10, 11, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('36126bf7-1b40-497f-b78b-b2fd4e3e9a94', 'item-8-6', 8, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'd0551e53-1ef1-431a-a827-2e1f30ea4aee', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('364ddebc-4956-4e53-a8f8-8cc127c5f5a0', 'item-17-16', 17, 16, 0, '907b7e87-45f1-44ec-b582-1de9f1b65baf', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:40:35.993580', '2024-10-19 15:40:35.993580');
INSERT INTO `map_item` VALUES ('367a8de4-71a5-4a76-a30d-2bcb63ac8e4e', 'item-7-12', 7, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'a6a3daa2-6ecd-4e0d-823b-dc7c60973ac4', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('36b0ef61-d18c-425f-ae99-e0a418d607b3', 'item-13-6', 13, 6, 2, 'a9120114-7eff-45a1-8061-b8faed17bf27', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:31.015823', '2024-10-19 11:26:31.015823');
INSERT INTO `map_item` VALUES ('36c3f113-36ab-49cd-96b9-975ccf78ee7d', 'item-6-9', 6, 9, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '17a055eb-0e42-4174-a0fc-e9be18b1b1a6', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('36e22e46-213c-4b39-a26c-e7e80e5fe2ac', 'item-3-2', 3, 2, 2, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:05.327895', '2024-10-19 11:25:05.327895');
INSERT INTO `map_item` VALUES ('390f6425-e613-4574-9372-118659fd1c5c', 'item-13-11', 13, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '27a4f6ca-98eb-43bf-b0ab-863a81d8764b', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:54.273383', '2024-10-19 15:20:27.000000');
INSERT INTO `map_item` VALUES ('39e04177-b91d-4b44-a6dc-1a832ddaca6f', 'item-9-16', 9, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'b244d404-c2b1-4ed3-9dfa-4010dc1dbf3e', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:24.543058', '2024-10-19 11:23:04.000000');
INSERT INTO `map_item` VALUES ('3cbdcf30-6c22-4745-bd84-ae4996ee2939', 'item-6-10', 6, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'a1c406be-10d5-4e26-97f8-67155551cd7d', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:23.157460', '2024-10-19 11:23:25.000000');
INSERT INTO `map_item` VALUES ('3d2d416e-3da5-4963-bf1d-a831b39fff7f', 'item-13-4', 13, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'befd4bd7-8417-4753-936a-0c0a24e18350', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:38.661236', '2024-10-19 16:30:51.000000');
INSERT INTO `map_item` VALUES ('3e8e44e3-e1f8-40fa-8ced-cb480a9dcff3', 'item-9-8', 9, 8, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('420ba5a7-86b9-47f9-813f-5fed8e1e5c12', 'item-12-12', 12, 12, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:18.672568', '2024-10-20 13:11:16.000000');
INSERT INTO `map_item` VALUES ('42380683-6780-4180-83e5-ff761ed226f0', 'item-9-3', 9, 3, 0, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:40.765549', '2024-10-19 11:25:40.765549');
INSERT INTO `map_item` VALUES ('479f71a9-cffb-4817-9668-517cec9163c9', 'item-12-11', 12, 11, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:16.370277', '2024-10-19 11:12:16.370277');
INSERT INTO `map_item` VALUES ('488d4ab5-199a-4c17-90bc-cfb95b2a5079', 'item-6-2', 6, 2, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '20ca4de0-4a75-4b5d-a18a-593f569b6298', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:34.836544', '2024-10-19 15:29:30.000000');
INSERT INTO `map_item` VALUES ('49dca4ce-5796-4dd0-af73-aae616ab294e', 'item-14-16', 14, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '83bbbdb1-045f-457b-9617-22ef77c80671', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:26.216824', '2024-10-19 11:22:53.000000');
INSERT INTO `map_item` VALUES ('4ae7dde0-ee98-4ce0-8e9f-d305cae010b9', 'item-7-2', 7, 2, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '8a81b1e8-9368-41f4-acb1-97a345477909', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:15:06.742783', '2024-10-19 15:29:35.000000');
INSERT INTO `map_item` VALUES ('4d10bab0-3dc3-4722-bc8a-e4dff5f3cc3d', 'item-9-14', 9, 14, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('4eb7ce0b-7e6f-4619-af1a-8081456455a9', 'item-7-15', 7, 15, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'fa153365-f214-4958-bd87-6a8e3093c4b2', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:46.076389', '2024-10-19 11:23:14.000000');
INSERT INTO `map_item` VALUES ('4ec9d2a5-af36-4352-93df-4c51e1ee501d', 'item-11-8', 11, 8, 2, '9e0ceef0-43a1-4991-b445-d341ae7429a7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('4ed1d71d-0653-429a-a2cc-6ffb5ce2fded', 'item-14-5', 14, 5, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '5d3a7c95-7803-4e1b-9e66-d3ddf61b90db', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:03.778536', '2024-10-19 11:22:03.000000');
INSERT INTO `map_item` VALUES ('50024096-08b4-435f-975b-606d741a8f46', 'item-15-13', 15, 13, 0, '2637e350-461b-4c73-b564-a4aae61632b5', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('51258605-c297-4bbd-bf95-083292b18bb8', 'item-8-17', 8, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '4a3c2d0d-f23a-4ee1-aef9-5dfb1855b25b', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:10.181538', '2024-10-19 15:24:35.000000');
INSERT INTO `map_item` VALUES ('55e1cda9-2ebf-40a4-98d4-1754b3b1360f', 'item-14-14', 14, 14, 1, '9e0ceef0-43a1-4991-b445-d341ae7429a7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('565d43e4-5651-425e-bcfe-37932af19148', 'item-8-11', 8, 11, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '602c49ac-dd3c-4d2c-957d-72db8c0f7f12', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('57134c7b-e32f-4f7a-b86d-8330f35b6a0e', 'item-9-9', 9, 9, 0, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('588db99e-4f7e-4bd7-89c7-8f232f1cb116', 'item-17-10', 17, 10, 1, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:47.378417', '2024-10-19 11:26:47.378417');
INSERT INTO `map_item` VALUES ('592b3390-965a-49f4-bbf7-90397f998a2b', 'item-9-7', 9, 7, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '0c3eae9c-62ce-4cfe-898a-879bfe69b92b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('59d68f04-d825-446f-8d29-68ab30b1aa57', 'item-3-5', 3, 5, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '6f8964d2-4466-486b-9319-23ce36deb411', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:28.004214', '2024-10-19 11:21:23.000000');
INSERT INTO `map_item` VALUES ('5a1b3cf2-db50-43ed-90fd-071cc0bc5ee1', 'item-10-13', 10, 13, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('5af97c7b-0b65-4c10-9ce4-56ff79e77373', 'item-17-14', 17, 14, 2, '907b7e87-45f1-44ec-b582-1de9f1b65baf', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:40:38.727923', '2024-10-19 15:40:38.727923');
INSERT INTO `map_item` VALUES ('5ce49230-2272-4be0-b744-8a648c9863ab', 'item-8-13', 8, 13, 2, '4327fa46-94ae-43a7-bbec-dd84206fa015', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:14:37.614193', '2024-10-19 15:14:37.614193');
INSERT INTO `map_item` VALUES ('5d3a7c95-7803-4e1b-9e66-d3ddf61b90db', 'item-14-4', 14, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'bd583fc5-9ade-4944-8915-ba916201f527', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:37.800631', '2024-10-19 16:31:31.000000');
INSERT INTO `map_item` VALUES ('5d865bad-a885-4c85-92d9-129b590a095d', 'item-5-3', 5, 3, 2, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '9d7c2fd0-e6d1-40b2-ab72-f10231aebdef', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:01:36.315742', '2024-10-19 11:21:10.000000');
INSERT INTO `map_item` VALUES ('5ebf9e29-0df7-4f62-b0d3-0b0ff84aee67', 'item-14-11', 14, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '8588ce07-5fc0-494a-b232-e0a77aa52604', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:53.561404', '2024-10-19 15:20:18.000000');
INSERT INTO `map_item` VALUES ('602c49ac-dd3c-4d2c-957d-72db8c0f7f12', 'item-8-12', 8, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'c8890684-54be-41af-aee3-af2d63473215', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('616e188e-53e5-45ba-8f04-0b96a3ce264f', 'item-6-6', 6, 6, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('62378ae8-84fd-4a74-ab26-6dd80bc8c17a', 'item-11-9', 11, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', NULL, NULL, '05382484-e271-46ed-954a-54823f3f5447', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-20 11:44:19.000000');
INSERT INTO `map_item` VALUES ('634cbd00-56da-4ea2-b23c-959903551cc7', 'item-16-9', 16, 9, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '15e896a8-5295-4abe-aa2d-0bc075b855bd', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:09.870264', '2024-10-19 11:22:20.000000');
INSERT INTO `map_item` VALUES ('67760f1a-ea66-48b1-9592-f0d3a1b604c6', 'item-3-4', 3, 4, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '883449f5-b497-44e7-8bd7-5351cd322c2c', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:26.620635', '2024-10-19 11:21:20.000000');
INSERT INTO `map_item` VALUES ('67d7e6c4-1782-43c8-8b29-e902ccb71585', 'item-5-11', 5, 11, 2, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('68bd3c89-e202-4565-83c4-e07dabde426d', 'item-13-14', 13, 14, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '1a3a8656-832b-4796-a51c-95f1af553381', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:29.393927', '2024-10-19 11:22:38.000000');
INSERT INTO `map_item` VALUES ('69ba4eb4-a218-4a91-8e10-12af73debd5b', 'item-7-12', 7, 12, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '291b824d-bc8a-4973-afed-8225e20b4413', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:43.172716', '2024-10-19 11:23:20.000000');
INSERT INTO `map_item` VALUES ('6c1c2d98-728b-4180-aabb-636ba5d8d2ac', 'item-11-17', 11, 17, 2, 'bbf2476f-0570-4809-8663-13492d31444b', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:16:44.168768', '2024-10-19 15:16:44.168768');
INSERT INTO `map_item` VALUES ('6f8964d2-4466-486b-9319-23ce36deb411', 'item-2-5', 2, 5, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '1625e12c-a424-4698-bb53-23f787f19d37', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:15.444740', '2024-10-19 15:28:54.000000');
INSERT INTO `map_item` VALUES ('7034aa50-94c6-4813-9258-09e5c09ec513', 'item-3-10', 3, 10, 0, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '0b3c874a-0090-4bd2-ad78-ff68f05a2621', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:11:48.151198', '2024-10-20 11:19:29.000000');
INSERT INTO `map_item` VALUES ('705f81c0-0710-46e4-8751-1997426eba38', 'item-2-10', 2, 10, 1, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:24:49.174982', '2024-10-19 11:24:49.174982');
INSERT INTO `map_item` VALUES ('70c3b7de-1910-447d-9196-d85b9bcbeed3', 'item-2-6', 2, 6, 3, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:00.197527', '2024-10-19 11:25:00.197527');
INSERT INTO `map_item` VALUES ('70c9ff53-35c1-4fd1-9b12-b7ce9de9a4f0', 'item-12-5', 12, 5, 3, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:57.237221', '2024-10-19 11:10:57.237221');
INSERT INTO `map_item` VALUES ('73955878-65b8-469a-83a6-b11b9e1316ff', 'item-10-9', 10, 9, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('73bde9d8-137e-404c-beea-7e4b13f7cade', 'item-15-12', 15, 12, 0, 'bbf2476f-0570-4809-8663-13492d31444b', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:27:06.812477', '2024-10-19 11:27:06.812477');
INSERT INTO `map_item` VALUES ('73c6cca5-f0e8-4a5a-a5f7-ad1b2002b864', 'item-13-13', 13, 13, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'e9212987-d681-4e1d-9f64-d8f2332d991b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('760e1a2b-b795-4682-a2f7-cab7920b0fe1', 'item-15-10', 15, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '8809eb9b-2006-4ad6-88c8-e3119fe5a2e4', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:10.987706', '2024-10-19 11:22:25.000000');
INSERT INTO `map_item` VALUES ('7670fe69-8f1a-472a-90ab-690339ef2ac2', 'item-6-10', 6, 10, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'b27dc4ff-1448-4f60-a602-7dd2982f2c8b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('76c730f5-619e-453a-927f-cc2eca0766a9', 'item-15-14', 15, 14, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'd7962df7-6b4c-4384-b6cb-4683a3aec808', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:28.339076', '2024-10-19 11:22:43.000000');
INSERT INTO `map_item` VALUES ('774898ad-bee1-44b5-ae25-5fdc1d89689f', 'item-11-5', 11, 5, 3, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:35:40.222996', '2024-10-19 15:35:40.222996');
INSERT INTO `map_item` VALUES ('77723347-265e-4d0e-9a34-e50dcb2e0f8d', 'item-6-15', 6, 15, 3, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:47.106813', '2024-10-19 15:15:47.106813');
INSERT INTO `map_item` VALUES ('7a82b206-5d2d-4a99-b7a7-818724d0dcf9', 'item-15-9', 15, 9, 2, '2637e350-461b-4c73-b564-a4aae61632b5', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('7afe1928-7fea-4bfa-a2d3-5798c8d77739', 'item-3-3', 3, 3, 3, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, 'f1476eef-f5a3-4097-b7fe-98651fed9ef6', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:11:38.629361', '2024-10-20 13:18:15.000000');
INSERT INTO `map_item` VALUES ('7c2d5a83-2ec1-4b91-8f90-b897c75f033d', 'item-11-7', 11, 7, 2, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('7c361b00-5c34-4b12-9faa-c027b4d9af54', 'item-15-12', 15, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '2180fae0-0d68-498c-8ce9-983bbad00636', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('7c5d1290-1169-49dd-911c-7b06f472b571', 'item-16-11', 16, 11, 0, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:39.357534', '2024-10-19 11:26:39.357534');
INSERT INTO `map_item` VALUES ('7cc52cc4-aea1-4078-95c0-c365f05ea915', 'item-3-9', 3, 9, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '25fd8f93-f54d-4e15-a6fd-4e90ecee44a6', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:32.836833', '2024-10-19 11:21:33.000000');
INSERT INTO `map_item` VALUES ('7d1212ca-4ca4-4de3-991d-ac2896ad1908', 'item-17-6', 17, 6, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '7ce5f79a-0055-4f20-9426-0cf4b507bb52', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:40.002860', '2024-10-19 16:36:14.000000');
INSERT INTO `map_item` VALUES ('7da69489-ce49-45ae-ae8a-6f7df5aab9c4', 'item-7-3', 7, 3, 2, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '4ae7dde0-ee98-4ce0-8e9f-d305cae010b9', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:01:39.864424', '2024-10-19 11:21:16.000000');
INSERT INTO `map_item` VALUES ('7ed03d98-bf84-4748-9cbe-faa8826e4ce1', 'item-9-2', 9, 2, 2, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:39.772177', '2024-10-19 11:25:39.772177');
INSERT INTO `map_item` VALUES ('7f917a21-23f0-4ff1-8706-a16173514b42', 'item-13-12', 13, 12, 0, 'bbf2476f-0570-4809-8663-13492d31444b', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:27:04.532342', '2024-10-19 11:27:04.532342');
INSERT INTO `map_item` VALUES ('80809339-7ba8-4d0e-9a5e-98250f74625b', 'item-7-7', 7, 7, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'd475d012-78bb-492a-9c0f-6636d3044362', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('8110d1db-8ec5-4b79-88bc-2eef24d7c759', 'item-17-8', 17, 8, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '68537471-6808-4f1c-842a-785dcbc269a3', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:41.472618', '2024-10-19 16:37:09.000000');
INSERT INTO `map_item` VALUES ('81592734-51ef-40b1-b321-3316ef833637', 'item-9-6', 9, 6, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '8e957239-71cf-4661-b6f6-26110d7227c0', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:15:43.980415', '2024-10-19 15:32:12.000000');
INSERT INTO `map_item` VALUES ('81c5b16c-060e-4ac9-9c17-bd11f9a14a34', 'item-16-4', 16, 4, 2, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:42.613851', '2024-10-19 11:26:42.613851');
INSERT INTO `map_item` VALUES ('83bbbdb1-045f-457b-9617-22ef77c80671', 'item-14-17', 14, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'b0fd1085-540c-4d90-bb28-e19235f9f7bd', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:13.771868', '2024-10-19 15:22:58.000000');
INSERT INTO `map_item` VALUES ('855e3d5a-cf02-46d6-9a21-9f4a9c2591b9', 'item-13-5', 13, 5, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '3d2d416e-3da5-4963-bf1d-a831b39fff7f', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:02.666484', '2024-10-19 11:22:00.000000');
INSERT INTO `map_item` VALUES ('8609f24d-e3c5-40d8-add2-132889b0f6e7', 'item-5-11', 5, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '00abddcb-3c2a-4222-8cbe-615455cdfc9a', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:02.999862', '2024-10-19 15:27:54.000000');
INSERT INTO `map_item` VALUES ('86e4be45-8fd7-4673-ab5e-a42f013cc038', 'item-15-14', 15, 14, 2, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('87999200-6207-47e9-af1a-98cd7e93aaf6', 'item-12-13', 12, 13, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:30.263164', '2024-10-19 11:18:30.263164');
INSERT INTO `map_item` VALUES ('8809eb9b-2006-4ad6-88c8-e3119fe5a2e4', 'item-15-11', 15, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '5df2f25e-9263-4c27-b7d9-481d91e797a8', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:53.102551', '2024-10-19 15:20:10.000000');
INSERT INTO `map_item` VALUES ('883449f5-b497-44e7-8bd7-5351cd322c2c', 'item-2-4', 2, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'a6c2105f-bcb2-4329-87e0-b94a587ddc0a', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:15.857770', '2024-10-19 15:28:58.000000');
INSERT INTO `map_item` VALUES ('883956d4-2555-4ea3-992e-72ea11f2cf33', 'item-14-12', 14, 12, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '7c361b00-5c34-4b12-9faa-c027b4d9af54', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('885f1af0-62be-4f13-ae3a-6f76815f0d2b', 'item-6-12', 6, 12, 3, '18e11a2f-876a-41d4-8b00-ea241e12b7cb', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:28.298448', '2024-10-19 15:15:28.298448');
INSERT INTO `map_item` VALUES ('8940e7c5-5ad1-4eb7-9aa9-a00ec27a9b71', 'item-8-16', 8, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '51258605-c297-4bbd-bf95-083292b18bb8', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:24.126441', '2024-10-19 11:23:08.000000');
INSERT INTO `map_item` VALUES ('8b3699b3-bd19-4471-9829-790e7ae1a6b0', 'item-17-4', 17, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:54.342709', '2024-10-19 11:26:54.342709');
INSERT INTO `map_item` VALUES ('8d5ccc35-eda8-40c5-b700-5be29a526164', 'item-16-16', 16, 16, 1, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:17:56.927564', '2024-10-19 11:17:56.927564');
INSERT INTO `map_item` VALUES ('8e34a11a-8c76-4ad6-bf07-42793e1f7534', 'item-16-6', 16, 6, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '7d1212ca-4ca4-4de3-991d-ac2896ad1908', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:06.062811', '2024-10-19 11:22:08.000000');
INSERT INTO `map_item` VALUES ('8ecd8922-b9a5-4b43-a25d-eb7411b5ca05', 'item-16-13', 16, 13, 0, '18e11a2f-876a-41d4-8b00-ea241e12b7cb', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:21.023889', '2024-10-19 15:15:21.023889');
INSERT INTO `map_item` VALUES ('94ec114f-e27b-4d95-9440-333ca933e6bc', 'item-6-8', 6, 8, 1, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'bbe3b833-b70c-4bcb-b730-149972ddcf0a', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('95e88901-5980-43fb-bb23-30a6edbc762c', 'item-11-12', 11, 12, 2, 'bbe096ab-7bae-416e-9e1f-354eaef53f66', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('96779453-bbb5-4011-838e-136299aef00c', 'item-15-15', 15, 15, 0, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:16:50.560642', '2024-10-19 15:16:50.560642');
INSERT INTO `map_item` VALUES ('971ba301-aa00-448c-bb5f-f1008515529a', 'item-12-14', 12, 14, 0, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, 'd0484a28-75c9-4b16-9058-fbb586962526', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:17:46.375709', '2024-10-20 11:21:46.000000');
INSERT INTO `map_item` VALUES ('9783c01f-b1d7-498d-a54c-d48877b48b2e', 'item-17-11', 17, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:53.041518', '2024-10-19 11:26:53.041518');
INSERT INTO `map_item` VALUES ('989a160f-70e5-4103-9f65-ae33d2e2f669', 'item-8-2', 8, 2, 1, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:37.456009', '2024-10-19 11:25:37.456009');
INSERT INTO `map_item` VALUES ('99093f05-ea84-4b2a-b30e-c9decf139e11', 'item-15-5', 15, 5, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'a8144931-6af3-4919-bc6c-69948765dc85', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:04.576846', '2024-10-19 11:22:06.000000');
INSERT INTO `map_item` VALUES ('994d2d5d-0868-4c27-b5ff-aca25caf5f85', 'item-12-8', 12, 8, 0, '18e11a2f-876a-41d4-8b00-ea241e12b7cb', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:15:17.056909', '2024-10-19 15:15:17.056909');
INSERT INTO `map_item` VALUES ('9d7c2fd0-e6d1-40b2-ab72-f10231aebdef', 'item-5-2', 5, 2, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '914850f0-7a71-47af-8ac1-64e64b7c143a', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:31.693318', '2024-10-19 15:29:26.000000');
INSERT INTO `map_item` VALUES ('9f2e1c7d-2543-4301-9704-2de822688b1c', 'item-15-11', 15, 11, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '8d3ba2d9-227d-4bec-b5b1-7b1d3e871ec8', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('9ff283c2-6475-475f-96d3-fec932016a67', 'item-3-7', 3, 7, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'b958c30c-80e5-4839-8858-abfb7ce366af', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:29.967525', '2024-10-19 11:21:26.000000');
INSERT INTO `map_item` VALUES ('a08451bb-aead-47eb-a063-926d42fb4fd8', 'item-15-10', 15, 10, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '6537ad1d-decf-4252-bfa1-61b4378b5fd0', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('a1c406be-10d5-4e26-97f8-67155551cd7d', 'item-6-11', 6, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '16302e74-c43c-4a69-a610-4bfa3f9587a2', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:03.652799', '2024-10-19 15:27:49.000000');
INSERT INTO `map_item` VALUES ('a34fa520-319e-4fa8-8bba-a3e2903f16f6', 'item-13-10', 13, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '390f6425-e613-4574-9372-118659fd1c5c', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:12.280222', '2024-10-19 11:22:32.000000');
INSERT INTO `map_item` VALUES ('a48bf348-1c23-4cd7-817f-8b719659c364', 'item-7-8', 7, 8, 0, 'bbf2476f-0570-4809-8663-13492d31444b', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:55.556382', '2024-10-19 11:25:55.556382');
INSERT INTO `map_item` VALUES ('a60c7613-34e4-4b67-9c13-912a7b9204fc', 'item-2-11', 2, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:20.788210', '2024-10-19 11:25:20.788210');
INSERT INTO `map_item` VALUES ('a6b95256-252a-478d-aa9c-9456c2ea637f', 'item-6-16', 6, 16, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:16:13.709199', '2024-10-19 15:16:13.709199');
INSERT INTO `map_item` VALUES ('a8144931-6af3-4919-bc6c-69948765dc85', 'item-15-4', 15, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '000315a0-5d86-469c-a138-e3fbf9544df2', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:37.357488', '2024-10-19 16:32:27.000000');
INSERT INTO `map_item` VALUES ('aa70a1dd-7b9a-4c27-ae5a-542e57323bfa', 'item-8-8', 8, 8, 0, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:04.942810', '2024-10-19 11:26:04.942810');
INSERT INTO `map_item` VALUES ('aa72b756-12cf-45e8-b4ab-6e590df50c6a', 'item-6-11', 6, 11, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('aaa02c71-3c2d-473b-bcd0-f24743ca1408', 'item-12-10', 12, 10, 3, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:11:29.520810', '2024-10-20 13:03:59.000000');
INSERT INTO `map_item` VALUES ('ac1e753d-8a03-48b7-9667-4f4886344769', 'item-4-10', 4, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'b7a5c06e-dbf8-444d-a746-43efb8e523ea', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:22.335938', '2024-10-19 11:23:30.000000');
INSERT INTO `map_item` VALUES ('ac377aec-2841-469c-b7b3-f34babce19e5', 'item-17-15', 17, 15, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'eb0ad8bd-20c7-40f7-9e52-37f25df09a0e', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:16.236619', '2024-10-19 15:21:14.000000');
INSERT INTO `map_item` VALUES ('b02d80bc-fe96-460a-8417-1650648a6ade', 'item-14-10', 14, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '5ebf9e29-0df7-4f62-b0d3-0b0ff84aee67', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:11.786332', '2024-10-19 11:22:29.000000');
INSERT INTO `map_item` VALUES ('b0ae9eed-82c8-4099-8f2e-329057c97d0a', 'item-14-9', 14, 9, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b17ec710-9a01-45ca-83d0-56f862c1a166', 'item-13-16', 13, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'ede540ac-ee60-46cb-acaf-1ab8f059fbb6', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:25.726980', '2024-10-19 11:22:55.000000');
INSERT INTO `map_item` VALUES ('b244d404-c2b1-4ed3-9dfa-4010dc1dbf3e', 'item-9-17', 9, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'd4b23da7-711c-4723-bc73-674149ddf740', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:10.741182', '2024-10-19 15:24:16.000000');
INSERT INTO `map_item` VALUES ('b27c2da7-eb49-4faa-a915-c65cde4bf4a1', 'item-9-11', 9, 11, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b27dc4ff-1448-4f60-a602-7dd2982f2c8b', 'item-5-10', 5, 10, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '190866ad-23b9-413d-902c-022592ee3ffe', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b2b807f2-4d54-4e8b-9e9c-06690a96aca3', 'item-2-2', 2, 2, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:19.585979', '2024-10-19 11:25:19.585979');
INSERT INTO `map_item` VALUES ('b3d08c17-e159-4d82-910d-cc9daa757bdc', 'item-5-6', 5, 6, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b5d01feb-df22-4900-a211-7d0ad3d9b4cd', 'item-12-13', 12, 13, 2, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '280024f0-c61e-4e7f-ade7-a8d6ea7acd95', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b765aac3-77e4-48a4-9ce5-241b115a351a', 'item-6-3', 6, 3, 2, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '488d4ab5-199a-4c17-90bc-cfb95b2a5079', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:01:38.022168', '2024-10-19 11:21:13.000000');
INSERT INTO `map_item` VALUES ('b7a5c06e-dbf8-444d-a746-43efb8e523ea', 'item-4-11', 4, 11, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'c36a2c80-227e-4088-b072-6dcf3048f8ec', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:02.585170', '2024-10-19 15:27:59.000000');
INSERT INTO `map_item` VALUES ('b7df6027-493a-4801-84aa-5cb53ec43451', 'item-6-7', 6, 7, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('b958c30c-80e5-4839-8858-abfb7ce366af', 'item-2-7', 2, 7, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'dc6ef122-bee6-4bea-b5d2-a6de8c984dff', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:13.956068', '2024-10-19 15:28:48.000000');
INSERT INTO `map_item` VALUES ('bbe3b833-b70c-4bcb-b730-149972ddcf0a', 'item-5-8', 5, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '70956455-6f4e-4227-adff-c45703fcddb1', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('bd025854-8469-4884-8610-c150e23fd60f', 'item-10-7', 10, 7, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('bf2d48a9-7dfa-4f29-8daf-25d2aa20c058', 'item-16-15', 16, 15, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'ac377aec-2841-469c-b7b3-f34babce19e5', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:27.822519', '2024-10-19 11:22:45.000000');
INSERT INTO `map_item` VALUES ('bf604b0b-b86c-4041-8878-86cf6705bde0', 'item-9-12', 9, 12, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('c0f66396-ecb2-402a-9fb5-1df44f812052', 'item-16-17', 16, 17, 1, '43db44ab-d856-472c-bee8-5e76dd4117c7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:40:47.567984', '2024-10-19 15:40:47.567984');
INSERT INTO `map_item` VALUES ('c25de415-9b99-4119-8267-a182813a303a', 'item-3-6', 3, 6, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:12:29.059742', '2024-10-20 13:04:11.000000');
INSERT INTO `map_item` VALUES ('c447cd86-1ee9-4d66-adda-98d37c0a6546', 'item-17-5', 17, 5, 1, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:49.203442', '2024-10-19 11:26:49.203442');
INSERT INTO `map_item` VALUES ('c4af3e78-a675-4d0f-8333-d8b82a04cc89', 'item-11-16', 11, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:25.146846', '2024-10-20 13:11:30.000000');
INSERT INTO `map_item` VALUES ('c651aeb6-7110-46ef-b2f1-322bb7cf5d54', 'item-13-15', 13, 15, 0, '18e11a2f-876a-41d4-8b00-ea241e12b7cb', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:17:00.453817', '2024-10-19 15:17:00.453817');
INSERT INTO `map_item` VALUES ('c712496e-8b20-4949-a8b0-e9d706f8e5c3', 'item-8-4', 8, 4, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'fae3dc91-981d-4349-bd15-9a0a65affd5d', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:22.867763', '2024-10-19 11:21:37.000000');
INSERT INTO `map_item` VALUES ('c79d60fd-43e6-47f4-bb1f-2c6ba68c173f', 'item-7-7', 7, 7, 3, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:00.307316', '2024-10-19 11:26:00.307316');
INSERT INTO `map_item` VALUES ('c8b66468-ec42-4a1b-8565-a3aa85030f30', 'item-15-17', 15, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'e136373c-0f9f-4a92-a9ae-0e9e4fba44a9', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:14.232314', '2024-10-19 15:22:13.000000');
INSERT INTO `map_item` VALUES ('c9728e70-1ea7-4ed7-9fc5-6e024242cbdd', 'item-12-7', 12, 7, 1, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:51.217408', '2024-10-19 11:10:51.217408');
INSERT INTO `map_item` VALUES ('c9988a4e-81a3-4759-9c04-3f1e3a4fce4e', 'item-11-8', 11, 8, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '12ade1b5-58b0-4d9c-8d2e-63233747b7e0', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:27.294421', '2024-10-19 16:28:13.000000');
INSERT INTO `map_item` VALUES ('cbd314a3-5f21-4a13-8885-77fa4a5852d7', 'item-14-13', 14, 13, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '4221bc48-8f1e-4013-930b-328f72642321', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:18.019762', '2024-10-19 15:20:45.000000');
INSERT INTO `map_item` VALUES ('cc1bb3de-b8bd-4a17-b17d-cdf93ff57f85', 'item-5-7', 5, 7, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('cdd6c0fc-b8bc-409f-ab2b-93fa77346131', 'item-7-14', 7, 14, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'f4425d1a-7b70-412e-8d31-92ebd216d861', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:52.841982', '2024-10-19 11:23:17.000000');
INSERT INTO `map_item` VALUES ('d1232f5b-fc46-4ba9-bdcc-b9d7dbc49c3e', 'item-11-14', 11, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'e2d7a271-7a13-4cdb-aa9d-df634f780af1', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('d184a4e2-d51c-468e-b33f-ead8893d20d1', 'item-14-13', 14, 13, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, 'd0484a28-75c9-4b16-9058-fbb586962526', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('d2e335c6-9432-407a-9ff5-3b0cfa0518ba', 'item-17-7', 17, 7, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '742e418a-6abc-471b-b63e-119c59a1548b', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:40.451688', '2024-10-19 16:35:42.000000');
INSERT INTO `map_item` VALUES ('d31aab19-7d05-4d5a-959d-a945470b601a', 'item-3-11', 3, 11, 0, '30089c21-6554-498e-a9ad-58d5d0e1fa62', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:25:02.415596', '2024-10-19 11:25:02.415596');
INSERT INTO `map_item` VALUES ('d3b5884a-f041-4c28-849e-8d1dd397c30e', 'item-12-16', 12, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:25.606189', '2024-10-20 11:20:57.000000');
INSERT INTO `map_item` VALUES ('d41bf7b2-b138-429a-9b48-c14bd9231e7a', 'item-13-7', 13, 7, 1, 'b853881d-3ff5-452e-88d0-c2ff3da16b9f', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:37.590999', '2024-10-19 11:26:37.590999');
INSERT INTO `map_item` VALUES ('d475d012-78bb-492a-9c0f-6636d3044362', 'item-7-6', 7, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'be5c8600-e97d-47ae-90a8-1b8201286f52', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('d5b72216-35ed-44b4-b5c7-d4ef091d43e7', 'item-5-10', 5, 10, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '8609f24d-e3c5-40d8-add2-132889b0f6e7', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:22.662157', '2024-10-19 11:23:27.000000');
INSERT INTO `map_item` VALUES ('d7962df7-6b4c-4384-b6cb-4683a3aec808', 'item-15-13', 15, 13, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'e76e3d22-06cc-4fa7-92a6-6f8233de7e51', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:17.486877', '2024-10-19 15:20:53.000000');
INSERT INTO `map_item` VALUES ('dbbf6660-d819-4b46-b3b6-039096d3cce6', 'item-13-9', 13, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '25ed23f3-4a6b-460d-b632-7573e5ffb003', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('dbc77484-7b4d-4058-a8c9-b9f12c74762c', 'item-15-8', 15, 8, 3, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('dc229d1d-f713-451d-8dd1-a75818e61047', 'item-16-10', 16, 10, 1, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, 'ad81242c-77fd-48f1-9eff-073a47716e6e', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:11:16.510199', '2024-10-20 13:03:42.000000');
INSERT INTO `map_item` VALUES ('de7513db-2ab3-4c6a-b3bc-efc82dad4887', 'item-12-9', 12, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '0cbbb4c0-a5e6-4228-8a4d-55cd48a2d3c9', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('de947a62-0a66-4a7e-a83c-1a5581a89d9f', 'item-14-14', 14, 14, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'cbd314a3-5f21-4a13-8885-77fa4a5852d7', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:28.859114', '2024-10-19 11:22:41.000000');
INSERT INTO `map_item` VALUES ('dfa0b756-3a9e-43ef-850f-8f4acf5fde24', 'item-9-7', 9, 7, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'e49a2223-c4a5-4d2e-8484-fd3e3cfd6b92', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:38.128479', '2024-10-19 11:21:45.000000');
INSERT INTO `map_item` VALUES ('e14bdf0c-79e8-40b4-8f28-ccccddbfecc0', 'item-11-6', 11, 6, 3, 'b0d48be1-9f24-4f8b-b808-8705d02422a7', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:35:47.744327', '2024-10-19 15:35:47.744327');
INSERT INTO `map_item` VALUES ('e1f83499-77ee-4294-bc65-db3bd76ea8da', 'item-11-13', 11, 13, 2, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'd1232f5b-fc46-4ba9-bdcc-b9d7dbc49c3e', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('e49a2223-c4a5-4d2e-8484-fd3e3cfd6b92', 'item-9-8', 9, 8, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'aa240565-66be-4808-8a14-b4693ceed63c', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:26.122655', '2024-10-19 16:27:05.000000');
INSERT INTO `map_item` VALUES ('e4b33dbd-1177-4353-9b62-41fea4a48b9d', 'item-10-6', 10, 6, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('e8e3d876-d170-4bee-9023-e9d0b732141e', 'item-7-11', 7, 11, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '367a8de4-71a5-4a76-a30d-2bcb63ac8e4e', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('e8f99b83-ef0d-4e3c-a7a4-f0d5d6f10114', 'item-5-12', 5, 12, 1, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('e9212987-d681-4e1d-9f64-d8f2332d991b', 'item-13-14', 13, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '703f6207-c635-4596-828b-e9ed497b7d0f', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('ea7891d3-7afc-4313-a105-ff30da885259', 'item-10-16', 10, 16, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '1a69541a-6a9a-4a78-aaa0-fd44a41ad1b2', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:24.966986', '2024-10-19 11:23:01.000000');
INSERT INTO `map_item` VALUES ('ebbf9974-c1e6-4729-bb8b-d8240187ab82', 'item-14-12', 14, 12, 0, 'bbf2476f-0570-4809-8663-13492d31444b', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:27:05.833976', '2024-10-19 11:27:05.833976');
INSERT INTO `map_item` VALUES ('ede540ac-ee60-46cb-acaf-1ab8f059fbb6', 'item-13-17', 13, 17, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '201c34cb-8714-4cab-ab73-2426ff7c49c7', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:13.314243', '2024-10-19 15:23:07.000000');
INSERT INTO `map_item` VALUES ('f16d9780-795c-42a0-9ada-6e5b2047ed16', 'item-14-8', 14, 8, 0, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.688045', '2024-10-17 17:17:11.791895');
INSERT INTO `map_item` VALUES ('f39e8d0d-8181-4999-93f7-754f11183f07', 'item-12-4', 12, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:26:56.176440', '2024-10-19 11:26:56.176440');
INSERT INTO `map_item` VALUES ('f4425d1a-7b70-412e-8d31-92ebd216d861', 'item-8-14', 8, 14, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '653ad60f-7dbb-4636-b895-286063663342', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:07.387244', '2024-10-19 15:25:20.000000');
INSERT INTO `map_item` VALUES ('f69496bf-7372-4a76-b5db-13cdeec7223d', 'item-11-7', 11, 7, 0, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', 'c9988a4e-81a3-4759-9c04-3f1e3a4fce4e', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:39.672056', '2024-10-19 11:21:51.000000');
INSERT INTO `map_item` VALUES ('f90b86dc-ab8b-4570-a688-55df3616a4d1', 'item-10-8', 10, 8, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, 'addc6c35-e653-437c-840d-f15a1a1278a3', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:14:26.546319', '2024-10-19 16:30:11.000000');
INSERT INTO `map_item` VALUES ('fa153365-f214-4958-bd87-6a8e3093c4b2', 'item-8-15', 8, 15, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '2f45039c-a6eb-42d9-aa56-f8d1d0c271df', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:19:07.814565', '2024-10-19 15:25:12.000000');
INSERT INTO `map_item` VALUES ('fae3dc91-981d-4349-bd15-9a0a65affd5d', 'item-9-4', 9, 4, 0, '17c59746-eb39-4d41-99af-da55342c5225', NULL, '2cc3da7a-0615-438f-ae0e-14807a4502f2', NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:15:42.810585', '2024-10-19 15:32:00.000000');
INSERT INTO `map_item` VALUES ('fe122837-937b-4a24-8fb9-858d3d20bebd', 'item-8-7', 8, 7, 0, '7ff0f290-ada2-4c45-a174-109daf72fd03', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:10:32.850414', '2024-10-20 11:20:32.000000');
INSERT INTO `map_item` VALUES ('fe506c09-a41f-4dbe-8fed-d54d53e32649', 'item-7-11', 7, 11, 1, '06325d8e-8bb1-4f41-b24a-61b0f73a1723', '14f68026-b09f-4b26-a0c7-22ad8c24cbff', NULL, NULL, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 11:18:31.548780', '2024-10-19 11:23:22.000000');

-- ----------------------------
-- Table structure for model
-- ----------------------------
DROP TABLE IF EXISTS `model`;
CREATE TABLE `model`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fileUrl` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of model
-- ----------------------------
INSERT INTO `model` VALUES ('12647fda-6496-4305-bcaa-03f3ac68f446', 'city_装饰_1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/a8e5939a127800879450278286e9affb.glb', 'a8e5939a127800879450278286e9affb.glb', '2024-10-19 10:40:06.550685', '2024-10-19 10:50:38.000000');
INSERT INTO `model` VALUES ('1decba8f-994a-419e-8883-60efce68a34d', 'city_道路-1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/bff0c7a5e1f952f4ba1d20bdc6b4f6d2.glb', 'bff0c7a5e1f952f4ba1d20bdc6b4f6d2.glb', '2024-10-19 08:57:56.647572', '2024-10-19 11:09:48.000000');
INSERT INTO `model` VALUES ('23a3758d-685f-4363-9f23-8cc82bdb539f', 'city_装饰_8', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/74177d367c3a7afbbc780d73f549efb2.glb', '74177d367c3a7afbbc780d73f549efb2.glb', '2024-10-19 15:13:52.182737', '2024-10-19 15:13:52.182737');
INSERT INTO `model` VALUES ('25a0f0a4-dff3-4815-8974-e20b4fe1f4d6', 'city_装饰_4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/db2540fe4fadf067a3a38a159ab0e511.glb', 'db2540fe4fadf067a3a38a159ab0e511.glb', '2024-10-19 10:40:45.938749', '2024-10-19 10:55:52.000000');
INSERT INTO `model` VALUES ('29078571-fab3-40f1-89de-340e18ebd201', 'city_装饰_5', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/67b3ab386b1f74e0e0a5964da176b500.glb', '67b3ab386b1f74e0e0a5964da176b500.glb', '2024-10-19 10:40:56.521723', '2024-10-19 10:40:56.521723');
INSERT INTO `model` VALUES ('38ec0bd7-f774-4425-a28c-944069363dee', 'village_传送门', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/9cce1b4699dc0c13c97483ceafa4e266.glb', '9cce1b4699dc0c13c97483ceafa4e266.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:56:55.000000');
INSERT INTO `model` VALUES ('44c57047-a428-4f9f-bd02-a9bb04dff564', 'village_house_lv1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/3c529ce3a4542527c1110ce686e50329.glb', '3c529ce3a4542527c1110ce686e50329.glb', '2024-10-17 17:30:40.518615', '2024-10-19 08:56:47.000000');
INSERT INTO `model` VALUES ('450af6ab-3fb3-4584-9d3f-6418121af172', 'village_装饰-1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/502cdd7aeba4177ec636beacfc527f8d.glb', '502cdd7aeba4177ec636beacfc527f8d.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:56:59.000000');
INSERT INTO `model` VALUES ('4fa1dde6-aadd-4a0f-97b0-37c352146f13', 'city_house_lv2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/721b72fb4588fb09f7913097e000ca6c.glb', '721b72fb4588fb09f7913097e000ca6c.glb', '2024-10-19 08:58:55.378588', '2024-10-19 09:15:39.000000');
INSERT INTO `model` VALUES ('502bbb71-fcf7-43db-9a34-78591a171b78', 'village_道路-5', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/ea4ae992316df00ad9fa9f09f014ac29.glb', 'ea4ae992316df00ad9fa9f09f014ac29.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:02.000000');
INSERT INTO `model` VALUES ('5058e570-c891-4172-9390-7fc719a0ab8d', 'city_道路-2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/286566d67564586e1b15513240afd651.glb', '286566d67564586e1b15513240afd651.glb', '2024-10-19 08:58:09.028833', '2024-10-19 11:09:56.000000');
INSERT INTO `model` VALUES ('57dfac25-a496-4752-ac61-036832e94e9e', 'city_house_lv1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/e22449b8aa1b23bf46d11343eb4874d7.glb', 'e22449b8aa1b23bf46d11343eb4874d7.glb', '2024-10-19 08:58:46.911915', '2024-10-19 09:40:28.000000');
INSERT INTO `model` VALUES ('63a72725-eb6e-4c28-91d0-2f2e1ed86049', 'village_道路-1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/14b7cd5cdb29a3bb9f337836509fe709.glb', '14b7cd5cdb29a3bb9f337836509fe709.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:06.000000');
INSERT INTO `model` VALUES ('67f70702-2ea0-4793-b12a-28fc9cd934a9', 'village_装饰-2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/770d61fc8bc5c1f987bb4349470d43cd.glb', '770d61fc8bc5c1f987bb4349470d43cd.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:09.000000');
INSERT INTO `model` VALUES ('7fefdf2c-e532-47d5-8e6c-ef713cd25ae7', 'city_道路-4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/8e41805c6f15279496b11b53088b7420.glb', '8e41805c6f15279496b11b53088b7420.glb', '2024-10-19 08:58:28.394377', '2024-10-19 08:58:28.394377');
INSERT INTO `model` VALUES ('95af5c8f-49ec-43d9-829d-3729df34c722', 'village_道路-2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/5935a9de7bef68878c558d21c59b5100.glb', '5935a9de7bef68878c558d21c59b5100.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:13.000000');
INSERT INTO `model` VALUES ('990d038c-6bc4-48d3-a685-417c0c1cff1b', 'village_道路-4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/0528f6e006b2a0d0202985d0fa14680f.glb', '0528f6e006b2a0d0202985d0fa14680f.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:16.000000');
INSERT INTO `model` VALUES ('9984b8d5-f050-4a68-8e68-426c1aa58882', 'village_house_lv0', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/46015163e09fb1b95adba7906cac1dfd.glb', '46015163e09fb1b95adba7906cac1dfd.glb', '2024-10-17 17:30:33.964630', '2024-10-19 08:56:51.000000');
INSERT INTO `model` VALUES ('9b8f555d-462c-4636-9d51-657ba6ac1e27', 'city_装饰_3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/d48b9b7a917037b9b2b2f33bfb44766e.glb', 'd48b9b7a917037b9b2b2f33bfb44766e.glb', '2024-10-19 10:40:35.529061', '2024-10-19 10:54:02.000000');
INSERT INTO `model` VALUES ('9e369c99-df1a-463e-88fb-856314d94b0a', 'city_装饰_2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/b5d81c8147af06f64a2916ed265eb90b.glb', 'b5d81c8147af06f64a2916ed265eb90b.glb', '2024-10-19 10:40:27.413701', '2024-10-19 10:52:26.000000');
INSERT INTO `model` VALUES ('9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2', 'village_装饰-4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/631968489331583c8f51daba7a9fc1a9.glb', '631968489331583c8f51daba7a9fc1a9.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:20.000000');
INSERT INTO `model` VALUES ('a71a79fd-6b4a-4c11-a068-fd2669524546', 'city_装饰_6', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/a2fef11f9b064c3bf42e268ee479c9b3.glb', 'a2fef11f9b064c3bf42e268ee479c9b3.glb', '2024-10-19 15:13:35.958930', '2024-10-19 15:13:35.958930');
INSERT INTO `model` VALUES ('ac805431-be1f-48dc-a82a-cce4e86c5246', 'city_装饰_7', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/7ca0926b4446b780d5458ba2c5cc268e.glb', '7ca0926b4446b780d5458ba2c5cc268e.glb', '2024-10-19 15:13:45.144804', '2024-10-19 15:13:45.144804');
INSERT INTO `model` VALUES ('b7b9aed2-4f37-4e5c-96a4-6439d47d5779', 'village_装饰-3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/0b0217b67c4af7ee942a960c80a8eb92.glb', '0b0217b67c4af7ee942a960c80a8eb92.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:23.000000');
INSERT INTO `model` VALUES ('bc32f530-a841-4062-9ff9-3e18f1b6def4', 'village_house_lv2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/a472728ddeff7376c06fe9f1eeae841c.glb', 'a472728ddeff7376c06fe9f1eeae841c.glb', '2024-10-17 17:30:47.889709', '2024-10-19 08:56:44.000000');
INSERT INTO `model` VALUES ('bcb2e19a-e79f-4d16-baa4-f08c7d5a254a', 'city_house_lv0', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/330b94896bd59c8525bc811cb36ce1c2.glb', '330b94896bd59c8525bc811cb36ce1c2.glb', '2024-10-19 08:58:38.783661', '2024-10-19 09:15:26.000000');
INSERT INTO `model` VALUES ('cffe922d-5364-45c4-a09f-f28d2c2bdd3c', 'village_道路-3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/a9d2b9b03f2beb499f7a893359fd8138.glb', 'a9d2b9b03f2beb499f7a893359fd8138.glb', '2024-10-17 17:17:12.710821', '2024-10-19 08:57:25.000000');
INSERT INTO `model` VALUES ('d48dc14e-f9e4-47cb-abcc-b055373d5df6', 'city_道路-3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/94d35458d8c469bab2e1a64592fcc087.glb', '94d35458d8c469bab2e1a64592fcc087.glb', '2024-10-19 08:58:16.105535', '2024-10-19 08:58:16.105535');

-- ----------------------------
-- Table structure for music
-- ----------------------------
DROP TABLE IF EXISTS `music`;
CREATE TABLE `music`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`, `name`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of music
-- ----------------------------
INSERT INTO `music` VALUES ('5a57ecb7-3842-46b5-8ced-a65cb98c59b0', 'Sunshine On My Mind 1 - Suno (AI)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/musics/e098814d022ca8fefcc299ba16850ddc.mp3', '2024-10-17 17:17:12.881370', '2024-10-17 17:17:12.912956');
INSERT INTO `music` VALUES ('b8681034-5a7e-4083-aa1b-b842f94e2e1f', 'Sunshine On My Mind 2 - Suno (AI)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/musics/d96e31d54ebb99a47c2597b2fd3a41f0.mp3', '2024-10-17 17:17:12.881370', '2024-10-17 17:17:12.912956');

-- ----------------------------
-- Table structure for property
-- ----------------------------
DROP TABLE IF EXISTS `property`;
CREATE TABLE `property`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `sellCost` int NOT NULL,
  `buildCost` int NOT NULL,
  `cost_lv0` int NOT NULL,
  `cost_lv1` int NOT NULL,
  `cost_lv2` int NOT NULL,
  `effectCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `streetId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_464e23f631bd9ac75d8592e3d68`(`streetId` ASC) USING BTREE,
  INDEX `FK_cb4945666a0c6c59a35a55f4f4a`(`mapId` ASC) USING BTREE,
  INDEX `IDX_464e23f631bd9ac75d8592e3d6`(`streetId` ASC) USING BTREE,
  INDEX `IDX_cb4945666a0c6c59a35a55f4f4`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_464e23f631bd9ac75d8592e3d68` FOREIGN KEY (`streetId`) REFERENCES `street` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_cb4945666a0c6c59a35a55f4f4a` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of property
-- ----------------------------
INSERT INTO `property` VALUES ('000315a0-5d86-469c-a138-e3fbf9544df2', '匹诺康尼-筑梦边境', 1200, 3000, 700, 2900, 4260, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:32:27.107621', '2024-10-19 16:32:27.107621');
INSERT INTO `property` VALUES ('00abddcb-3c2a-4222-8cbe-615455cdfc9a', '成华大道-2号', 1600, 900, 1120, 1820, 2270, NULL, 'ba0d9383-4f6e-4f9a-9ff6-ce5a1b497535', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:27:54.859550', '2024-10-19 16:14:52.000000');
INSERT INTO `property` VALUES ('085e51bb-3824-40a5-b0dc-2d45d27841af', '南街-4号', 1800, 600, 1400, 1800, 2100, NULL, '29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('1102ff45-64e1-4e04-a74a-76ca522ca144', '东街-2号', 1100, 300, 800, 1000, 1200, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('12ade1b5-58b0-4d9c-8d2e-63233747b7e0', '匹诺康尼-热砂的时刻', 2000, 1800, 1200, 2900, 3800, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:28:13.925929', '2024-10-19 16:28:13.925929');
INSERT INTO `property` VALUES ('12fdec7b-0ab1-4bb2-8be1-d936bd33c388', '喜帖街-2号', 2200, 1300, 1600, 2300, 3000, NULL, 'c8792d08-1af8-4af5-bf16-5c243072557c', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:32:08.029086', '2024-10-19 16:21:53.000000');
INSERT INTO `property` VALUES ('14b53b3f-640b-4671-b1e7-b44c74655cbf', '南街-3号', 1000, 1200, 600, 1600, 2400, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('1625e12c-a424-4698-bb53-23f787f19d37', '二仙桥-4号', 1000, 1200, 600, 1600, 2000, NULL, '4a36645c-e9d2-43d5-9682-37b29b909017', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:53.994473', '2024-10-19 16:17:54.000000');
INSERT INTO `property` VALUES ('16302e74-c43c-4a69-a610-4bfa3f9587a2', '成华大道-1号', 1400, 500, 980, 1420, 1670, NULL, 'ba0d9383-4f6e-4f9a-9ff6-ce5a1b497535', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:27:49.041720', '2024-10-19 16:14:24.000000');
INSERT INTO `property` VALUES ('190866ad-23b9-413d-902c-022592ee3ffe', '东街-1号', 900, 1300, 600, 1800, 2600, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('201c34cb-8714-4cab-ab73-2426ff7c49c7', '机会大街-3号', 1900, 1100, 1330, 2180, 2730, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:23:07.302093', '2024-10-19 16:12:09.000000');
INSERT INTO `property` VALUES ('20ca4de0-4a75-4b5d-a18a-593f569b6298', '蓝蓝路-3号', 1600, 600, 1120, 1640, 1940, NULL, 'c6f340ce-90f7-4a9e-b410-bc6165f8f588', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:29:30.720671', '2024-10-19 16:23:26.000000');
INSERT INTO `property` VALUES ('2180fae0-0d68-498c-8ce9-983bbad00636', '西街-3号', 2300, 200, 1600, 1800, 2000, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('23734694-26c8-441a-856f-0b111aa34f61', '二仙桥-2号', 700, 1200, 400, 1400, 2000, NULL, '4a36645c-e9d2-43d5-9682-37b29b909017', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:44.321696', '2024-10-19 16:17:17.000000');
INSERT INTO `property` VALUES ('27a4f6ca-98eb-43bf-b0ab-863a81d8764b', '森之路-3号', 1200, 1100, 800, 1620, 2170, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:27.693339', '2024-10-19 16:10:25.000000');
INSERT INTO `property` VALUES ('2cc3da7a-0615-438f-ae0e-14807a4502f2', '喜帖街-1号', 2000, 1200, 1600, 2320, 2920, NULL, 'c8792d08-1af8-4af5-bf16-5c243072557c', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:32:00.703708', '2024-10-19 16:21:43.000000');
INSERT INTO `property` VALUES ('2f45039c-a6eb-42d9-aa56-f8d1d0c271df', '矿山路-1号', 800, 500, 560, 940, 1190, NULL, 'a7a62a04-a2db-49b4-b1e1-3a44ace0860b', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:25:12.734000', '2024-10-19 16:13:27.000000');
INSERT INTO `property` VALUES ('325d18e3-0ee9-4972-ae5e-024fcb98a87b', '森之路-4号', 1400, 1100, 980, 1780, 2330, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:36.037538', '2024-10-19 16:10:55.000000');
INSERT INTO `property` VALUES ('4221bc48-8f1e-4013-930b-328f72642321', '森之路-5号', 1300, 900, 910, 1580, 2030, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:45.532459', '2024-10-19 16:10:43.000000');
INSERT INTO `property` VALUES ('4a3c2d0d-f23a-4ee1-aef9-5dfb1855b25b', '机会大街-6号', 2500, 800, 2000, 2400, 2800, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:24:35.051318', '2024-10-19 16:13:05.000000');
INSERT INTO `property` VALUES ('4fb266ea-3405-445a-9b0f-2df99431f293', '机会大街-4号', 2000, 1000, 1400, 2200, 2700, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:24:09.148947', '2024-10-19 16:12:25.000000');
INSERT INTO `property` VALUES ('50467e4d-ebfa-4771-8b6a-285a9d930dee', '镜之迷宫-糖果星宿', 700, 700, 600, 1100, 1400, NULL, 'c320f445-bbef-4ffe-a9d8-0fc7b36b561d', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:36:44.842504', '2024-10-19 16:39:23.000000');
INSERT INTO `property` VALUES ('57c32853-76ea-4b35-ab7e-f21da844d1f4', '蓝蓝路-1号', 1600, 600, 1120, 1640, 1940, NULL, 'c6f340ce-90f7-4a9e-b410-bc6165f8f588', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:29:22.708149', '2024-10-19 16:22:42.000000');
INSERT INTO `property` VALUES ('5df2f25e-9263-4c27-b7d9-481d91e797a8', '森之路-1号', 1300, 1000, 910, 1640, 2140, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:10.133054', '2024-10-19 16:09:57.000000');
INSERT INTO `property` VALUES ('6537ad1d-decf-4252-bfa1-61b4378b5fd0', '西街-1号', 400, 200, 200, 400, 800, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('653ad60f-7dbb-4636-b895-286063663342', '矿山路-2号', 900, 400, 630, 960, 1160, NULL, 'a7a62a04-a2db-49b4-b1e1-3a44ace0860b', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:25:20.637302', '2024-10-19 16:13:36.000000');
INSERT INTO `property` VALUES ('68537471-6808-4f1c-842a-785dcbc269a3', '镜之迷宫-橄榄大海', 800, 800, 560, 1120, 1520, NULL, 'c320f445-bbef-4ffe-a9d8-0fc7b36b561d', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:37:09.295691', '2024-10-19 16:38:53.000000');
INSERT INTO `property` VALUES ('703f6207-c635-4596-828b-e9ed497b7d0f', '北街-1号', 1100, 500, 700, 1000, 1300, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('70956455-6f4e-4227-adff-c45703fcddb1', '东街-3号', 1000, 600, 500, 1200, 1800, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('742e418a-6abc-471b-b63e-119c59a1548b', '镜之迷宫-胡萝卜城堡', 1000, 1000, 700, 1400, 1900, NULL, 'c320f445-bbef-4ffe-a9d8-0fc7b36b561d', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:35:42.359895', '2024-10-19 16:38:48.000000');
INSERT INTO `property` VALUES ('7ce5f79a-0055-4f20-9426-0cf4b507bb52', '镜之迷宫-彩虹之路', 700, 700, 490, 980, 1330, NULL, 'c320f445-bbef-4ffe-a9d8-0fc7b36b561d', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:36:14.258883', '2024-10-19 16:38:38.000000');
INSERT INTO `property` VALUES ('8588ce07-5fc0-494a-b232-e0a77aa52604', '森之路 -2号', 1400, 1200, 980, 1840, 2440, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:18.181727', '2024-10-19 16:10:11.000000');
INSERT INTO `property` VALUES ('8a81b1e8-9368-41f4-acb1-97a345477909', '蓝蓝路-4号', 1600, 700, 1120, 1700, 2050, NULL, 'c6f340ce-90f7-4a9e-b410-bc6165f8f588', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:29:35.266641', '2024-10-19 16:23:39.000000');
INSERT INTO `property` VALUES ('8d3ba2d9-227d-4bec-b5b1-7b1d3e871ec8', '西街-2号', 1800, 400, 1200, 1600, 1800, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('8e957239-71cf-4661-b6f6-26110d7227c0', '喜帖街-3号', 1900, 900, 1600, 1900, 2300, NULL, 'c8792d08-1af8-4af5-bf16-5c243072557c', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:32:12.888006', '2024-10-19 16:22:08.000000');
INSERT INTO `property` VALUES ('914850f0-7a71-47af-8ac1-64e64b7c143a', '蓝蓝路-2号', 1600, 600, 1300, 1400, 1700, NULL, 'c6f340ce-90f7-4a9e-b410-bc6165f8f588', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:29:26.715222', '2024-10-19 16:22:52.000000');
INSERT INTO `property` VALUES ('94355ea6-d8b2-4453-8c7f-01810492c628', '矿山路-3号', 700, 200, 490, 680, 780, NULL, 'a7a62a04-a2db-49b4-b1e1-3a44ace0860b', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:25:27.587424', '2024-10-19 16:13:48.000000');
INSERT INTO `property` VALUES ('9e6bd246-9b1c-4927-8ad4-2d69567eaf27', '南街-5号', 900, 600, 400, 1000, 1500, NULL, '29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('9e797068-c351-4311-92b3-dbe8d9aaf612', '二仙桥-1号', 800, 1600, 500, 1800, 2600, NULL, '4a36645c-e9d2-43d5-9682-37b29b909017', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:38.446018', '2024-10-19 16:17:03.000000');
INSERT INTO `property` VALUES ('a261c0fa-bc33-4bc6-be42-89e60c76238a', '北街-2号', 800, 200, 300, 600, 1000, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('a6a3daa2-6ecd-4e0d-823b-dc7c60973ac4', '北街-5号', 2000, 1000, 1300, 2000, 3000, NULL, 'e9598b99-657a-498f-bc05-e32ce207dedf', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('a6c2105f-bcb2-4329-87e0-b94a587ddc0a', '二仙桥-5号', 800, 1600, 600, 1200, 3200, NULL, '4a36645c-e9d2-43d5-9682-37b29b909017', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:58.574539', '2024-10-19 16:18:20.000000');
INSERT INTO `property` VALUES ('aa240565-66be-4808-8a14-b4693ceed63c', '匹诺康尼-黄金的时刻', 2500, 1000, 1750, 2600, 3100, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:27:05.941455', '2024-10-19 16:27:05.941455');
INSERT INTO `property` VALUES ('addc6c35-e653-437c-840d-f15a1a1278a3', '匹诺康尼-朝露的时刻', 2100, 1200, 1470, 2400, 3000, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:30:11.677439', '2024-10-19 16:30:11.677439');
INSERT INTO `property` VALUES ('b0fd1085-540c-4d90-bb28-e19235f9f7bd', '机会大街-2号', 2200, 1200, 1540, 2480, 3080, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:22:58.143346', '2024-10-19 16:11:57.000000');
INSERT INTO `property` VALUES ('bd583fc5-9ade-4944-8915-ba916201f527', '匹诺康尼-薄暮的时刻', 2800, 2000, 1960, 3440, 4440, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:31:31.749946', '2024-10-19 16:31:31.749946');
INSERT INTO `property` VALUES ('be5c8600-e97d-47ae-90a8-1b8201286f52', '南街-1号', 1600, 1200, 1000, 1600, 3200, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('befd4bd7-8417-4753-936a-0c0a24e18350', '匹诺康尼-太阳的时刻', 2600, 1000, 1900, 2600, 3300, NULL, '8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:30:51.225813', '2024-10-19 16:30:51.225813');
INSERT INTO `property` VALUES ('c36a2c80-227e-4088-b072-6dcf3048f8ec', '成华大道-3号', 1700, 800, 1190, 1840, 2240, NULL, 'ba0d9383-4f6e-4f9a-9ff6-ce5a1b497535', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:27:59.608853', '2024-10-19 16:14:39.000000');
INSERT INTO `property` VALUES ('c8890684-54be-41af-aee3-af2d63473215', '北街-4号', 1800, 800, 800, 1600, 2200, NULL, 'e9598b99-657a-498f-bc05-e32ce207dedf', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('d0551e53-1ef1-431a-a827-2e1f30ea4aee', '南街-2号', 1200, 800, 800, 1600, 2200, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('d4b23da7-711c-4723-bc73-674149ddf740', '机会大街-5号', 2100, 900, 1470, 2220, 2600, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:24:16.772276', '2024-10-20 05:44:59.000000');
INSERT INTO `property` VALUES ('d7bfa59a-bbc3-4a2b-aa7c-e9d01408e1f2', '矿山路-4号', 900, 700, 630, 1140, 1490, NULL, 'a7a62a04-a2db-49b4-b1e1-3a44ace0860b', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:25:32.996079', '2024-10-19 16:13:59.000000');
INSERT INTO `property` VALUES ('dc6ef122-bee6-4bea-b5d2-a6de8c984dff', '二仙桥-3号', 900, 1500, 400, 1800, 2600, NULL, '4a36645c-e9d2-43d5-9682-37b29b909017', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:48.356675', '2024-10-19 16:17:38.000000');
INSERT INTO `property` VALUES ('e136373c-0f9f-4a92-a9ae-0e9e4fba44a9', '机会大街-1号', 2000, 1100, 1400, 2260, 2810, NULL, 'b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:22:13.860659', '2024-10-19 16:11:47.000000');
INSERT INTO `property` VALUES ('e2d7a271-7a13-4cdb-aa9d-df634f780af1', '北街-3号', 1000, 500, 500, 1100, 1500, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.418877', '2024-10-17 17:17:11.473557');
INSERT INTO `property` VALUES ('e76e3d22-06cc-4fa7-92a6-6f8233de7e51', '森之路-6号', 1100, 1200, 770, 1700, 2300, NULL, '5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:20:53.551878', '2024-10-19 16:11:11.000000');
INSERT INTO `property` VALUES ('eb0ad8bd-20c7-40f7-9e52-37f25df09a0e', '独家村', 3200, 2200, 2100, 3720, 5000, NULL, 'b80fac51-7c33-4796-83d2-e4d4f93d4f66', '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:21:14.771632', '2024-10-19 16:37:39.000000');

-- ----------------------------
-- Table structure for role
-- ----------------------------
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `roleName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `baseUrl` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `color` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`, `roleName`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of role
-- ----------------------------
INSERT INTO `role` VALUES ('97a9de0a-01a3-42ff-9cc0-51eba5ca9747', 'Kabi', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/roles', 'e3739794-0ae5-4d2c-9eb7-0a48b2ded464', '#CC2222', '2024-10-17 17:17:12.807408', '2024-10-17 17:17:12.846159');
INSERT INTO `role` VALUES ('b031ffcf-daa3-49d8-adc0-757d716ef884', '呆猫', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/roles', '4f58c2c0-4695-47ad-90ad-891641e4ebba', '#001EFF', '2024-10-17 17:17:12.807408', '2024-10-17 17:17:12.846159');

-- ----------------------------
-- Table structure for street
-- ----------------------------
DROP TABLE IF EXISTS `street`;
CREATE TABLE `street`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `increase` float NOT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `create_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_77a9e66101e2cec9b265ba40f33`(`mapId` ASC) USING BTREE,
  INDEX `IDX_77a9e66101e2cec9b265ba40f3`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_77a9e66101e2cec9b265ba40f33` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of street
-- ----------------------------
INSERT INTO `street` VALUES ('04648184-8a02-4d00-9d17-7c92f8eb08bd', '东街', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');
INSERT INTO `street` VALUES ('25316b68-8d5e-4ba8-a2dd-ceb2a003d893', '北街-1', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');
INSERT INTO `street` VALUES ('29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', '南街-2', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');
INSERT INTO `street` VALUES ('4a36645c-e9d2-43d5-9682-37b29b909017', '二仙桥', 1.5, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:28:23.487536', '2024-10-19 15:28:23.487536');
INSERT INTO `street` VALUES ('5f87c7d4-6f9e-4ce0-af6d-3244f40dbce8', '森之路', 1.2, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:19:39.908260', '2024-10-19 15:19:39.908260');
INSERT INTO `street` VALUES ('8a6ca541-b5d1-4436-8b96-8b5ae149ee22', '匹诺康尼', 1.1, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:25:35.706527', '2024-10-19 16:25:35.706527');
INSERT INTO `street` VALUES ('a745d851-304e-41cb-9569-7ad1eda285e7', '南街-1', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');
INSERT INTO `street` VALUES ('a7a62a04-a2db-49b4-b1e1-3a44ace0860b', '矿山路', 1.3, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:24:51.256619', '2024-10-19 15:24:51.256619');
INSERT INTO `street` VALUES ('b09b7ab1-a5b8-479b-8ecb-c577360f8ea2', '机会大街', 1.5, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:21:56.764691', '2024-10-19 15:21:56.764691');
INSERT INTO `street` VALUES ('b09d0cee-4bff-44a9-b943-92d706944438', '西街', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');
INSERT INTO `street` VALUES ('b80fac51-7c33-4796-83d2-e4d4f93d4f66', '独家村', 1.2, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:21:06.952306', '2024-10-19 15:21:06.952306');
INSERT INTO `street` VALUES ('ba0d9383-4f6e-4f9a-9ff6-ce5a1b497535', '成华大道', 1.3, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:27:34.037650', '2024-10-19 15:27:34.037650');
INSERT INTO `street` VALUES ('c320f445-bbef-4ffe-a9d8-0fc7b36b561d', '镜之迷宫', 1.4, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 16:34:08.444992', '2024-10-19 16:34:08.444992');
INSERT INTO `street` VALUES ('c6f340ce-90f7-4a9e-b410-bc6165f8f588', '蓝蓝路', 1.3, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:29:14.439673', '2024-10-19 15:29:14.439673');
INSERT INTO `street` VALUES ('c8792d08-1af8-4af5-bf16-5c243072557c', '喜帖街', 1.2, '65791190-c8cb-4947-8201-5d5c18d26384', '2024-10-19 15:31:53.158410', '2024-10-19 15:31:53.158410');
INSERT INTO `street` VALUES ('e9598b99-657a-498f-bc05-e32ce207dedf', '北街-2', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275', '2024-10-17 17:17:11.311688', '2024-10-17 17:17:11.367731');

SET FOREIGN_KEY_CHECKS = 1;
