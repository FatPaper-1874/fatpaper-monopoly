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

 Date: 08/08/2024 14:01:15
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
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of arrived_event
-- ----------------------------
INSERT INTO `arrived_event` VALUES ('350573c5-7af5-49a8-9949-5b3eea57f93f', '意外之财', '从管理员口袋里掏2000块', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/1683bc0580b01b56127b71b5f7b45bd6.png', 'arrivedPlayer.gain(2000);');
INSERT INTO `arrived_event` VALUES ('749bae19-4f4a-420b-94ba-b0eb3932504a', '末地的馈赠', '随机获得一张卡片', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/d84ad18aae04a17b0b32f0f94860642f.png', 'arrivedPlayer.gainCard(1);');
INSERT INTO `arrived_event` VALUES ('74a209c5-5cf0-4814-aedd-db70b62e251f', '股~票~', '随机获得或者失去一些钱(-2000到2000)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/f2de616121f5c8118765734a375fe8bf.png', 'const money = Math.round((Number(Math.random().toFixed(1)) - 0.5) * 2 * 2000);\r\n    arrivedPlayer.setMoney(arrivedPlayer.getMoney() + money);');
INSERT INTO `arrived_event` VALUES ('7748876a-1a5f-4bbe-ba96-242fbb19198a', '哇！是公园', '来都来了，睡一会（一个回合）', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/arrived_event_icons/4a5e7f9ce17b628790cbe5ed7a9ebf46.png', 'arrivedPlayer.setStop(1);');

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
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of chance_card
-- ----------------------------
INSERT INTO `chance_card` VALUES ('07741b66-1507-47c6-8c6a-bff020d94089', '你的名字?', '和目标交换位置', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/3acf8ee5af1c6f7cb770e3a12f00f46e.png', 'rgb(231, 213, 120)', 'ToOtherPlayer', 'const sourcePositionIndex = sourcePlayer.getPositionIndex();\r\n    sourcePlayer.tp(target.getPositionIndex());\r\n    target.tp(sourcePositionIndex);');
INSERT INTO `chance_card` VALUES ('0df44579-bc4a-4632-82df-2f3eddc1662d', '/tp', '传送到目标玩家的脚边', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/eb824db3c1942345b636dbeef574ba27.png', 'rgb(213, 57, 231)', 'ToOtherPlayer', 'sourcePlayer.tp(target.getPositionIndex());');
INSERT INTO `chance_card` VALUES ('38ecd9c8-2352-49a4-920f-a4afd2865b09', '这是我的地', '抢夺目标房屋的拥有权', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/78b158809e6bc69ffc7fac8b7368bb62.png', 'rgb(249, 5, 5)', 'ToProperty', 'target.setOwner(sourcePlayer);');
INSERT INTO `chance_card` VALUES ('706dcb77-2180-4940-ae30-f8cd89eb11c4', '中奖啦!!!', '从管理员的钱包里拿到了2000块', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/77858df095ce198049c617618e4b57d8.png', 'rgb(231, 195, 57)', 'ToSelf', 'sourcePlayer.gain(2000);');
INSERT INTO `chance_card` VALUES ('7670dba2-d980-408e-8663-fe81077cab58', 'PUA', 'PUA一名玩家, 让他给你2000块', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/0a856f5402f568c00ab8ed9d5b485a72.png', 'rgb(46, 222, 58)', 'ToOtherPlayer', 'target.cost(2000);\r\n    sourcePlayer.gain(2000);');
INSERT INTO `chance_card` VALUES ('7c2a7708-2f3d-46af-8513-5aa8524219c6', 'Build Up!', '提升目标建筑的一个等级', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/3beb99f2a5209cb62f01771af8d30ef5.png', 'rgb(155, 233, 48)', 'ToProperty', 'if(target.getBuildingLevel() >= 2) throw Error(\'这个建筑已经是最高级别的啦\');\r\n    target.buildUp();');
INSERT INTO `chance_card` VALUES ('9014b91a-acf6-4384-afed-86495ea00bd9', '小睡一下', '让目标玩家睡一回合', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/chance_card_icons/d5711c8d2126746a1c90c1d0f4614349.png', 'rgb(46, 124, 222)', 'ToPlayer', 'target.setStop(1);');

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
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_02335a3ca1f71795334f32e6c8d`(`modelId` ASC) USING BTREE,
  CONSTRAINT `FK_02335a3ca1f71795334f32e6c8d` FOREIGN KEY (`modelId`) REFERENCES `model` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of item_type
-- ----------------------------
INSERT INTO `item_type` VALUES ('0462ea20-73ad-4ee9-85f5-772980ac344b', '#B70404', 'r1', 1, '95af5c8f-49ec-43d9-829d-3729df34c722');
INSERT INTO `item_type` VALUES ('1c808dd7-b050-4273-9d72-deb060f2f6d1', '#59a669', '道路-3', 1, 'cffe922d-5364-45c4-a09f-f28d2c2bdd3c');
INSERT INTO `item_type` VALUES ('1ccdd87c-38e4-43f0-869a-b5feefe18dba', '#3d39c6', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78');
INSERT INTO `item_type` VALUES ('201873e1-d77e-4513-9d1f-e569c7a385c7', '#eacf15', '道路-2', 1, '95af5c8f-49ec-43d9-829d-3729df34c722');
INSERT INTO `item_type` VALUES ('2637e350-461b-4c73-b564-a4aae61632b5', '#7bcf30', '装饰-4', 1, '9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2');
INSERT INTO `item_type` VALUES ('2ed9f123-4c4b-47da-b020-b8d92403b29e', '#BE1717', 'r1', 1, '95af5c8f-49ec-43d9-829d-3729df34c722');
INSERT INTO `item_type` VALUES ('39625035-293f-4c80-83b3-1310488b7583', '#D92222', 'p', 1, '95af5c8f-49ec-43d9-829d-3729df34c722');
INSERT INTO `item_type` VALUES ('53c18321-82a8-4b50-8efb-f067920eb5da', '#47b8b7', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b');
INSERT INTO `item_type` VALUES ('53df1f44-e0c1-45dd-9e98-4f7395bb2f69', '#7426d9', '道路-2', 1, '95af5c8f-49ec-43d9-829d-3729df34c722');
INSERT INTO `item_type` VALUES ('670df220-ccd5-44e9-a969-f2b337026615', '#3300FF', 'r4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b');
INSERT INTO `item_type` VALUES ('81bbd488-deab-4de5-b47c-a284171dd456', '#ac5390', '道路-1', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049');
INSERT INTO `item_type` VALUES ('959dc759-96aa-491d-8d0d-54a41e950ce6', '#d42bc8', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b');
INSERT INTO `item_type` VALUES ('99a8eea3-ad70-4115-b3a5-05e867424a6f', '#047BB7', 'r2', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049');
INSERT INTO `item_type` VALUES ('9e0ceef0-43a1-4991-b445-d341ae7429a7', '#9c636d', '装饰-3', 1, 'b7b9aed2-4f37-4e5c-96a4-6439d47d5779');
INSERT INTO `item_type` VALUES ('9f1ef778-8a82-493a-a8c6-879c582d6114', '#951B1B', '装饰1', 1, '450af6ab-3fb3-4584-9d3f-6418121af172');
INSERT INTO `item_type` VALUES ('a6f52c20-2f71-4e70-9aa3-e37d263e4719', '#5f42bd', '装饰-1', 1, '450af6ab-3fb3-4584-9d3f-6418121af172');
INSERT INTO `item_type` VALUES ('a7642d4c-f901-465d-861b-1c4fab3f7950', '#0DFF00', 'r5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78');
INSERT INTO `item_type` VALUES ('ac164ee0-d517-4154-aa30-29728405aa48', '#CC42FF', '装饰4', 1, '9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2');
INSERT INTO `item_type` VALUES ('ac9c2c87-38e2-4876-a4d5-d4d854228020', '#a9b847', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78');
INSERT INTO `item_type` VALUES ('acda5889-08ce-4d34-a6e6-f02ea27cba9d', '#1B6695', '装饰2', 1, '67f70702-2ea0-4793-b12a-28fc9cd934a9');
INSERT INTO `item_type` VALUES ('b19a208b-b82a-4120-8dfc-f58469b026f3', '#209edf', '道路-1', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049');
INSERT INTO `item_type` VALUES ('ba3de769-de9a-411e-8162-feffd50e8ab1', '#ad5290', '装饰-2', 1, '67f70702-2ea0-4793-b12a-28fc9cd934a9');
INSERT INTO `item_type` VALUES ('bbe096ab-7bae-416e-9e1f-354eaef53f66', '#B81F1F', '传送门', 1, '38ec0bd7-f774-4425-a28c-944069363dee');
INSERT INTO `item_type` VALUES ('bda18871-1d91-4b91-8ee2-55bca3a7a907', '#4dbb44', '道路-4', 1, '990d038c-6bc4-48d3-a685-417c0c1cff1b');
INSERT INTO `item_type` VALUES ('cd6dfa2f-202d-4a90-a037-1b855f1a742a', '#300FD3', 'test', 1, '38ec0bd7-f774-4425-a28c-944069363dee');
INSERT INTO `item_type` VALUES ('e1cb701f-33b0-4de8-8f64-fa03e00484a8', '#9d20df', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78');
INSERT INTO `item_type` VALUES ('e3f15ae1-6663-4ec2-a607-e4fa20eb248b', '#2599E1', '装饰3', 1, 'b7b9aed2-4f37-4e5c-96a4-6439d47d5779');
INSERT INTO `item_type` VALUES ('e666e548-dcdf-4335-9c4e-9a73008de34c', '#0048FF', 'r3', 1, 'cffe922d-5364-45c4-a09f-f28d2c2bdd3c');
INSERT INTO `item_type` VALUES ('f3450d27-3991-4b09-8042-8046a40849f4', '#8617BE', 'r2', 1, '63a72725-eb6e-4c28-91d0-2f2e1ed86049');
INSERT INTO `item_type` VALUES ('f5957d38-9667-4f99-9090-650b4cc59bab', '#8d7f72', '道路-5', 1, '502bbb71-fcf7-43db-9a34-78591a171b78');

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
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of itemtype_map
-- ----------------------------
INSERT INTO `itemtype_map` VALUES ('1c808dd7-b050-4273-9d72-deb060f2f6d1', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('1ccdd87c-38e4-43f0-869a-b5feefe18dba', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `itemtype_map` VALUES ('201873e1-d77e-4513-9d1f-e569c7a385c7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('2637e350-461b-4c73-b564-a4aae61632b5', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('53c18321-82a8-4b50-8efb-f067920eb5da', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('53df1f44-e0c1-45dd-9e98-4f7395bb2f69', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `itemtype_map` VALUES ('9e0ceef0-43a1-4991-b445-d341ae7429a7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('a6f52c20-2f71-4e70-9aa3-e37d263e4719', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('b19a208b-b82a-4120-8dfc-f58469b026f3', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('ba3de769-de9a-411e-8162-feffd50e8ab1', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('bbe096ab-7bae-416e-9e1f-354eaef53f66', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `itemtype_map` VALUES ('bda18871-1d91-4b91-8ee2-55bca3a7a907', '26d4da24-6d54-4348-b1d8-83b4c336083a');
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
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of map
-- ----------------------------
INSERT INTO `map` VALUES ('26d4da24-6d54-4348-b1d8-83b4c336083a', 'test', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/backgrounds/4ea45e85a729b5ac1a6ad832e4010f50.png', '0fc16bb0-5a0e-45fc-b8fc-7b386e0a7968,2e61d5b5-5a67-49a1-bda0-0624e77b9a7b,56ac604a-3650-479e-994d-4846cd00878e,62b268de-4318-4b9e-9779-df9aab3bf5af,c9f896c5-19dd-4030-85d3-caa18b80a781,9cd4a1c7-b9af-4ad4-a8f2-3746144d1ac5,7bc3e403-410c-4f25-b18b-638c9118d79d,cc34ff91-e3af-473d-ad0f-2b47d79ffca5');
INSERT INTO `map` VALUES ('d01a06c2-fef1-4350-bcc3-986e44325275', '乡村小富翁', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/backgrounds/c22d43b35c4b7a8e45cf0071c90fb984.png', '00cbff62-a2a4-4e61-bbf1-8de5ffcb15eb,592b3390-965a-49f4-bbf7-90397f998a2b,bd025854-8469-4884-8610-c150e23fd60f,34b8fcc8-d844-4137-b8b8-249fd27305bc,73955878-65b8-469a-83a6-b11b9e1316ff,62378ae8-84fd-4a74-ab26-6dd80bc8c17a,de7513db-2ab3-4c6a-b3bc-efc82dad4887,dbbf6660-d819-4b46-b3b6-039096d3cce6,b0ae9eed-82c8-4099-8f2e-329057c97d0a,26f3d819-4c1c-451f-8be3-01637a2ccbdc,17ce549c-b147-4767-8522-58f7292dd6ac,883956d4-2555-4ea3-992e-72ea11f2cf33,d184a4e2-d51c-468e-b33f-ead8893d20d1,73c6cca5-f0e8-4a5a-a5f7-ad1b2002b864,b5d01feb-df22-4900-a211-7d0ad3d9b4cd,e1f83499-77ee-4294-bc65-db3bd76ea8da,5a1b3cf2-db50-43ed-90fd-071cc0bc5ee1,09deb52a-0d9f-471c-ba23-c80c3555b1b6,350e9f9c-bd1f-4541-8958-57cb1d418d30,b27c2da7-eb49-4faa-a915-c65cde4bf4a1,565d43e4-5651-425e-bcfe-37932af19148,e8e3d876-d170-4bee-9023-e9d0b732141e,aa72b756-12cf-45e8-b4ab-6e590df50c6a,7670fe69-8f1a-472a-90ab-690339ef2ac2,36c3f113-36ab-49cd-96b9-975ccf78ee7d,94ec114f-e27b-4d95-9440-333ca933e6bc,b7df6027-493a-4801-84aa-5cb53ec43451,80809339-7ba8-4d0e-9a5e-98250f74625b');

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
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of map_chance_card
-- ----------------------------
INSERT INTO `map_chance_card` VALUES ('07741b66-1507-47c6-8c6a-bff020d94089', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('0df44579-bc4a-4632-82df-2f3eddc1662d', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('38ecd9c8-2352-49a4-920f-a4afd2865b09', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_chance_card` VALUES ('706dcb77-2180-4940-ae30-f8cd89eb11c4', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('7670dba2-d980-408e-8663-fe81077cab58', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('7c2a7708-2f3d-46af-8513-5aa8524219c6', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_chance_card` VALUES ('9014b91a-acf6-4384-afed-86495ea00bd9', 'd01a06c2-fef1-4350-bcc3-986e44325275');

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
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `REL_871af6c53eab8923149b9eeb40`(`propertyId` ASC) USING BTREE,
  INDEX `FK_f73ad06dec0392c99615705500c`(`typeId` ASC) USING BTREE,
  INDEX `FK_49e601052131e6153296763f7ee`(`linktoId` ASC) USING BTREE,
  INDEX `FK_b6e5e161770ab9f8831bd7c24aa`(`mapId` ASC) USING BTREE,
  INDEX `FK_bbfcd5ab1dedbe5caa541cba789`(`arrivedEventId` ASC) USING BTREE,
  CONSTRAINT `FK_49e601052131e6153296763f7ee` FOREIGN KEY (`linktoId`) REFERENCES `map_item` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `FK_871af6c53eab8923149b9eeb403` FOREIGN KEY (`propertyId`) REFERENCES `property` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_b6e5e161770ab9f8831bd7c24aa` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_bbfcd5ab1dedbe5caa541cba789` FOREIGN KEY (`arrivedEventId`) REFERENCES `arrived_event` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `FK_f73ad06dec0392c99615705500c` FOREIGN KEY (`typeId`) REFERENCES `item_type` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of map_item
-- ----------------------------
INSERT INTO `map_item` VALUES ('00cbff62-a2a4-4e61-bbf1-8de5ffcb15eb', 'item-8-7', 8, 7, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '36126bf7-1b40-497f-b78b-b2fd4e3e9a94', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('018eafc7-a08c-44b6-9ad5-074bfb567ff6', 'item-4-4', 4, 4, 0, '1ccdd87c-38e4-43f0-869a-b5feefe18dba', NULL, 'b16a77c5-4577-4728-b2df-3e83ffee86b9', NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('09deb52a-0d9f-471c-ba23-c80c3555b1b6', 'item-10-12', 10, 12, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '749bae19-4f4a-420b-94ba-b0eb3932504a', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('0c3eae9c-62ce-4cfe-898a-879bfe69b92b', 'item-9-6', 9, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '14b53b3f-640b-4671-b1e7-b44c74655cbf', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('0cbbb4c0-a5e6-4228-8a4d-55cd48a2d3c9', 'item-12-8', 12, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '085e51bb-3824-40a5-b0dc-2d45d27841af', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('0e6e0354-88ec-476a-b8fa-bd493bd00a92', 'item-9-13', 9, 13, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('0fc16bb0-5a0e-45fc-b8fc-7b386e0a7968', 'item-3-7', 3, 7, 0, 'bda18871-1d91-4b91-8ee2-55bca3a7a907', NULL, NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('17a055eb-0e42-4174-a0fc-e9be18b1b1a6', 'item-5-9', 5, 9, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '1102ff45-64e1-4e04-a74a-76ca522ca144', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('17ce549c-b147-4767-8522-58f7292dd6ac', 'item-14-11', 14, 11, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '9f2e1c7d-2543-4301-9704-2de822688b1c', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('25ed23f3-4a6b-460d-b632-7573e5ffb003', 'item-13-8', 13, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '9e6bd246-9b1c-4927-8ad4-2d69567eaf27', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('26f3d819-4c1c-451f-8be3-01637a2ccbdc', 'item-14-10', 14, 10, 1, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'a08451bb-aead-47eb-a063-926d42fb4fd8', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('280024f0-c61e-4e7f-ade7-a8d6ea7acd95', 'item-12-14', 12, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'a261c0fa-bc33-4bc6-be42-89e60c76238a', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('2e61d5b5-5a67-49a1-bda0-0624e77b9a7b', 'item-4-7', 4, 7, 0, '53df1f44-e0c1-45dd-9e98-4f7395bb2f69', NULL, NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('2fef62c2-01c8-4e10-bacd-e6fbfe32becc', 'item-10-14', 10, 14, 1, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('320c6ded-1019-4756-bcf8-adc472be4fcc', 'item-6-12', 6, 12, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('34b8fcc8-d844-4137-b8b8-249fd27305bc', 'item-10-8', 10, 8, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '7748876a-1a5f-4bbe-ba96-242fbb19198a', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('350e9f9c-bd1f-4541-8958-57cb1d418d30', 'item-10-11', 10, 11, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('36126bf7-1b40-497f-b78b-b2fd4e3e9a94', 'item-8-6', 8, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'd0551e53-1ef1-431a-a827-2e1f30ea4aee', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('367a8de4-71a5-4a76-a30d-2bcb63ac8e4e', 'item-7-12', 7, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'a6a3daa2-6ecd-4e0d-823b-dc7c60973ac4', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('36c3f113-36ab-49cd-96b9-975ccf78ee7d', 'item-6-9', 6, 9, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '17a055eb-0e42-4174-a0fc-e9be18b1b1a6', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('3e8e44e3-e1f8-40fa-8ced-cb480a9dcff3', 'item-9-8', 9, 8, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('4d10bab0-3dc3-4722-bc8a-e4dff5f3cc3d', 'item-9-14', 9, 14, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('4ec9d2a5-af36-4352-93df-4c51e1ee501d', 'item-11-8', 11, 8, 2, '9e0ceef0-43a1-4991-b445-d341ae7429a7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('50024096-08b4-435f-975b-606d741a8f46', 'item-15-13', 15, 13, 0, '2637e350-461b-4c73-b564-a4aae61632b5', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('55e1cda9-2ebf-40a4-98d4-1754b3b1360f', 'item-14-14', 14, 14, 1, '9e0ceef0-43a1-4991-b445-d341ae7429a7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('565d43e4-5651-425e-bcfe-37932af19148', 'item-8-11', 8, 11, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '602c49ac-dd3c-4d2c-957d-72db8c0f7f12', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('56ac604a-3650-479e-994d-4846cd00878e', 'item-5-7', 5, 7, 0, 'bda18871-1d91-4b91-8ee2-55bca3a7a907', NULL, NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('57134c7b-e32f-4f7a-b86d-8330f35b6a0e', 'item-9-9', 9, 9, 0, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('592b3390-965a-49f4-bbf7-90397f998a2b', 'item-9-7', 9, 7, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '0c3eae9c-62ce-4cfe-898a-879bfe69b92b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('5a1b3cf2-db50-43ed-90fd-071cc0bc5ee1', 'item-10-13', 10, 13, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('602c49ac-dd3c-4d2c-957d-72db8c0f7f12', 'item-8-12', 8, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'c8890684-54be-41af-aee3-af2d63473215', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('616e188e-53e5-45ba-8f04-0b96a3ce264f', 'item-6-6', 6, 6, 1, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('62378ae8-84fd-4a74-ab26-6dd80bc8c17a', 'item-11-9', 11, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('62b268de-4318-4b9e-9779-df9aab3bf5af', 'item-5-6', 5, 6, 1, '53df1f44-e0c1-45dd-9e98-4f7395bb2f69', NULL, NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('67d7e6c4-1782-43c8-8b29-e902ccb71585', 'item-5-11', 5, 11, 2, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('6dc5fef5-356b-4b08-8668-1463bbee5774', 'item-2-6', 2, 6, 0, '1ccdd87c-38e4-43f0-869a-b5feefe18dba', NULL, '5a4e23b4-6cf3-4788-b9dc-2e7858e56541', NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('73955878-65b8-469a-83a6-b11b9e1316ff', 'item-10-9', 10, 9, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('73c6cca5-f0e8-4a5a-a5f7-ad1b2002b864', 'item-13-13', 13, 13, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'e9212987-d681-4e1d-9f64-d8f2332d991b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('7670fe69-8f1a-472a-90ab-690339ef2ac2', 'item-6-10', 6, 10, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'b27dc4ff-1448-4f60-a602-7dd2982f2c8b', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('7a82b206-5d2d-4a99-b7a7-818724d0dcf9', 'item-15-9', 15, 9, 2, '2637e350-461b-4c73-b564-a4aae61632b5', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('7bc3e403-410c-4f25-b18b-638c9118d79d', 'item-3-5', 3, 5, 0, 'bda18871-1d91-4b91-8ee2-55bca3a7a907', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('7c2d5a83-2ec1-4b91-8f90-b897c75f033d', 'item-11-7', 11, 7, 2, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('7c361b00-5c34-4b12-9faa-c027b4d9af54', 'item-15-12', 15, 12, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '2180fae0-0d68-498c-8ce9-983bbad00636', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('80809339-7ba8-4d0e-9a5e-98250f74625b', 'item-7-7', 7, 7, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'd475d012-78bb-492a-9c0f-6636d3044362', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('83a81636-b738-4b49-8837-16742aa8806b', 'item-5-4', 5, 4, 0, '1ccdd87c-38e4-43f0-869a-b5feefe18dba', NULL, 'e150d431-1c3f-46a0-84b4-5f34679d280f', NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('86e4be45-8fd7-4673-ab5e-a42f013cc038', 'item-15-14', 15, 14, 2, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('883956d4-2555-4ea3-992e-72ea11f2cf33', 'item-14-12', 14, 12, 1, '201873e1-d77e-4513-9d1f-e569c7a385c7', '7c361b00-5c34-4b12-9faa-c027b4d9af54', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('94ec114f-e27b-4d95-9440-333ca933e6bc', 'item-6-8', 6, 8, 1, 'b19a208b-b82a-4120-8dfc-f58469b026f3', 'bbe3b833-b70c-4bcb-b730-149972ddcf0a', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('95e88901-5980-43fb-bb23-30a6edbc762c', 'item-11-12', 11, 12, 2, 'bbe096ab-7bae-416e-9e1f-354eaef53f66', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('9cd4a1c7-b9af-4ad4-a8f2-3746144d1ac5', 'item-4-5', 4, 5, 0, '53df1f44-e0c1-45dd-9e98-4f7395bb2f69', '018eafc7-a08c-44b6-9ad5-074bfb567ff6', NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('9f2e1c7d-2543-4301-9704-2de822688b1c', 'item-15-11', 15, 11, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '8d3ba2d9-227d-4bec-b5b1-7b1d3e871ec8', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('a08451bb-aead-47eb-a063-926d42fb4fd8', 'item-15-10', 15, 10, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '6537ad1d-decf-4252-bfa1-61b4378b5fd0', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('aa72b756-12cf-45e8-b4ab-6e590df50c6a', 'item-6-11', 6, 11, 0, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b0ae9eed-82c8-4099-8f2e-329057c97d0a', 'item-14-9', 14, 9, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b27c2da7-eb49-4faa-a915-c65cde4bf4a1', 'item-9-11', 9, 11, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b27dc4ff-1448-4f60-a602-7dd2982f2c8b', 'item-5-10', 5, 10, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '190866ad-23b9-413d-902c-022592ee3ffe', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b3d08c17-e159-4d82-910d-cc9daa757bdc', 'item-5-6', 5, 6, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b5d01feb-df22-4900-a211-7d0ad3d9b4cd', 'item-12-13', 12, 13, 2, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '280024f0-c61e-4e7f-ade7-a8d6ea7acd95', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('b7df6027-493a-4801-84aa-5cb53ec43451', 'item-6-7', 6, 7, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '350573c5-7af5-49a8-9949-5b3eea57f93f', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('bbe3b833-b70c-4bcb-b730-149972ddcf0a', 'item-5-8', 5, 8, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '70956455-6f4e-4227-adff-c45703fcddb1', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('bd025854-8469-4884-8610-c150e23fd60f', 'item-10-7', 10, 7, 2, '1c808dd7-b050-4273-9d72-deb060f2f6d1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('bf604b0b-b86c-4041-8878-86cf6705bde0', 'item-9-12', 9, 12, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('c9f896c5-19dd-4030-85d3-caa18b80a781', 'item-5-5', 5, 5, 0, 'bda18871-1d91-4b91-8ee2-55bca3a7a907', '83a81636-b738-4b49-8837-16742aa8806b', NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('cc1bb3de-b8bd-4a17-b17d-cdf93ff57f85', 'item-5-7', 5, 7, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('cc34ff91-e3af-473d-ad0f-2b47d79ffca5', 'item-3-6', 3, 6, 1, '53df1f44-e0c1-45dd-9e98-4f7395bb2f69', '6dc5fef5-356b-4b08-8668-1463bbee5774', NULL, NULL, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `map_item` VALUES ('d1232f5b-fc46-4ba9-bdcc-b9d7dbc49c3e', 'item-11-14', 11, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'e2d7a271-7a13-4cdb-aa9d-df634f780af1', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('d184a4e2-d51c-468e-b33f-ead8893d20d1', 'item-14-13', 14, 13, 0, '53c18321-82a8-4b50-8efb-f067920eb5da', NULL, NULL, '74a209c5-5cf0-4814-aedd-db70b62e251f', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('d475d012-78bb-492a-9c0f-6636d3044362', 'item-7-6', 7, 6, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, 'be5c8600-e97d-47ae-90a8-1b8201286f52', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('dbbf6660-d819-4b46-b3b6-039096d3cce6', 'item-13-9', 13, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '25ed23f3-4a6b-460d-b632-7573e5ffb003', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('dbc77484-7b4d-4058-a8c9-b9f12c74762c', 'item-15-8', 15, 8, 3, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('de7513db-2ab3-4c6a-b3bc-efc82dad4887', 'item-12-9', 12, 9, 0, '201873e1-d77e-4513-9d1f-e569c7a385c7', '0cbbb4c0-a5e6-4228-8a4d-55cd48a2d3c9', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('e1f83499-77ee-4294-bc65-db3bd76ea8da', 'item-11-13', 11, 13, 2, '201873e1-d77e-4513-9d1f-e569c7a385c7', 'd1232f5b-fc46-4ba9-bdcc-b9d7dbc49c3e', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('e4b33dbd-1177-4353-9b62-41fea4a48b9d', 'item-10-6', 10, 6, 0, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('e8e3d876-d170-4bee-9023-e9d0b732141e', 'item-7-11', 7, 11, 0, 'b19a208b-b82a-4120-8dfc-f58469b026f3', '367a8de4-71a5-4a76-a30d-2bcb63ac8e4e', NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('e8f99b83-ef0d-4e3c-a7a4-f0d5d6f10114', 'item-5-12', 5, 12, 1, 'ba3de769-de9a-411e-8162-feffd50e8ab1', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('e9212987-d681-4e1d-9f64-d8f2332d991b', 'item-13-14', 13, 14, 0, 'e1cb701f-33b0-4de8-8f64-fa03e00484a8', NULL, '703f6207-c635-4596-828b-e9ed497b7d0f', NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `map_item` VALUES ('f16d9780-795c-42a0-9ada-6e5b2047ed16', 'item-14-8', 14, 8, 0, 'a6f52c20-2f71-4e70-9aa3-e37d263e4719', NULL, NULL, NULL, 'd01a06c2-fef1-4350-bcc3-986e44325275');

-- ----------------------------
-- Table structure for model
-- ----------------------------
DROP TABLE IF EXISTS `model`;
CREATE TABLE `model`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fileUrl` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of model
-- ----------------------------
INSERT INTO `model` VALUES ('38ec0bd7-f774-4425-a28c-944069363dee', '传送门', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/9cce1b4699dc0c13c97483ceafa4e266.glb', '9cce1b4699dc0c13c97483ceafa4e266.glb');
INSERT INTO `model` VALUES ('450af6ab-3fb3-4584-9d3f-6418121af172', '装饰-1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/502cdd7aeba4177ec636beacfc527f8d.glb', '502cdd7aeba4177ec636beacfc527f8d.glb');
INSERT INTO `model` VALUES ('502bbb71-fcf7-43db-9a34-78591a171b78', '道路-5', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/ea4ae992316df00ad9fa9f09f014ac29.glb', 'ea4ae992316df00ad9fa9f09f014ac29.glb');
INSERT INTO `model` VALUES ('63a72725-eb6e-4c28-91d0-2f2e1ed86049', '道路-1', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/14b7cd5cdb29a3bb9f337836509fe709.glb', '14b7cd5cdb29a3bb9f337836509fe709.glb');
INSERT INTO `model` VALUES ('67f70702-2ea0-4793-b12a-28fc9cd934a9', '装饰-2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/770d61fc8bc5c1f987bb4349470d43cd.glb', '770d61fc8bc5c1f987bb4349470d43cd.glb');
INSERT INTO `model` VALUES ('95af5c8f-49ec-43d9-829d-3729df34c722', '道路-2', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/5935a9de7bef68878c558d21c59b5100.glb', '5935a9de7bef68878c558d21c59b5100.glb');
INSERT INTO `model` VALUES ('990d038c-6bc4-48d3-a685-417c0c1cff1b', '道路-4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/0528f6e006b2a0d0202985d0fa14680f.glb', '0528f6e006b2a0d0202985d0fa14680f.glb');
INSERT INTO `model` VALUES ('9ef65bcc-eca0-4c57-8bf4-72b8a71a57e2', '装饰-4', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/631968489331583c8f51daba7a9fc1a9.glb', '631968489331583c8f51daba7a9fc1a9.glb');
INSERT INTO `model` VALUES ('b7b9aed2-4f37-4e5c-96a4-6439d47d5779', '装饰-3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/0b0217b67c4af7ee942a960c80a8eb92.glb', '0b0217b67c4af7ee942a960c80a8eb92.glb');
INSERT INTO `model` VALUES ('cffe922d-5364-45c4-a09f-f28d2c2bdd3c', '道路-3', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/models/a9d2b9b03f2beb499f7a893359fd8138.glb', 'a9d2b9b03f2beb499f7a893359fd8138.glb');

-- ----------------------------
-- Table structure for music
-- ----------------------------
DROP TABLE IF EXISTS `music`;
CREATE TABLE `music`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`, `name`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of music
-- ----------------------------
INSERT INTO `music` VALUES ('5a57ecb7-3842-46b5-8ced-a65cb98c59b0', 'Sunshine On My Mind 1 - Suno (AI)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/musics/e098814d022ca8fefcc299ba16850ddc.mp3');
INSERT INTO `music` VALUES ('b8681034-5a7e-4083-aa1b-b842f94e2e1f', 'Sunshine On My Mind 2 - Suno (AI)', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/musics/d96e31d54ebb99a47c2597b2fd3a41f0.mp3');

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
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_464e23f631bd9ac75d8592e3d68`(`streetId` ASC) USING BTREE,
  INDEX `FK_cb4945666a0c6c59a35a55f4f4a`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_464e23f631bd9ac75d8592e3d68` FOREIGN KEY (`streetId`) REFERENCES `street` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_cb4945666a0c6c59a35a55f4f4a` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of property
-- ----------------------------
INSERT INTO `property` VALUES ('085e51bb-3824-40a5-b0dc-2d45d27841af', '南街-4号', 1800, 600, 1400, 1800, 2100, NULL, '29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('1102ff45-64e1-4e04-a74a-76ca522ca144', '东街-2号', 1100, 300, 800, 1000, 1200, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('14b53b3f-640b-4671-b1e7-b44c74655cbf', '南街-3号', 1000, 1200, 600, 1600, 2400, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('190866ad-23b9-413d-902c-022592ee3ffe', '东街-1号', 900, 1300, 600, 1800, 2600, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('2180fae0-0d68-498c-8ce9-983bbad00636', '西街-3号', 2300, 200, 1600, 1800, 2000, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('5a4e23b4-6cf3-4788-b9dc-2e7858e56541', 'rew', 100, 100, 100, 100, 100, NULL, 'c4a69149-b0e5-46c0-bf06-0559bfa7ed0d', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `property` VALUES ('6537ad1d-decf-4252-bfa1-61b4378b5fd0', '西街-1号', 400, 200, 200, 400, 800, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('703f6207-c635-4596-828b-e9ed497b7d0f', '北街-1号', 1100, 500, 700, 1000, 1300, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('70956455-6f4e-4227-adff-c45703fcddb1', '东街-3号', 1000, 600, 500, 1200, 1800, NULL, '04648184-8a02-4d00-9d17-7c92f8eb08bd', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('8d3ba2d9-227d-4bec-b5b1-7b1d3e871ec8', '西街-2号', 1800, 400, 1200, 1600, 1800, NULL, 'b09d0cee-4bff-44a9-b943-92d706944438', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('9e6bd246-9b1c-4927-8ad4-2d69567eaf27', '南街-5号', 900, 600, 400, 1000, 1500, NULL, '29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('a261c0fa-bc33-4bc6-be42-89e60c76238a', '北街-2号', 800, 200, 300, 600, 1000, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('a6a3daa2-6ecd-4e0d-823b-dc7c60973ac4', '北街-5号', 2000, 1000, 1300, 2000, 3000, NULL, 'e9598b99-657a-498f-bc05-e32ce207dedf', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('b16a77c5-4577-4728-b2df-3e83ffee86b9', '123', 100, 100, 100, 100, 100, NULL, 'c4a69149-b0e5-46c0-bf06-0559bfa7ed0d', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `property` VALUES ('be5c8600-e97d-47ae-90a8-1b8201286f52', '南街-1号', 1600, 1200, 1000, 1600, 3200, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('c8890684-54be-41af-aee3-af2d63473215', '北街-4号', 1800, 800, 800, 1600, 2200, NULL, 'e9598b99-657a-498f-bc05-e32ce207dedf', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('d0551e53-1ef1-431a-a827-2e1f30ea4aee', '南街-2号', 1200, 800, 800, 1600, 2200, NULL, 'a745d851-304e-41cb-9569-7ad1eda285e7', 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `property` VALUES ('e150d431-1c3f-46a0-84b4-5f34679d280f', '432', 100, 100, 100, 100, 100, NULL, 'c4a69149-b0e5-46c0-bf06-0559bfa7ed0d', '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `property` VALUES ('e2d7a271-7a13-4cdb-aa9d-df634f780af1', '北街-3号', 1000, 500, 500, 1100, 1500, NULL, '25316b68-8d5e-4ba8-a2dd-ceb2a003d893', 'd01a06c2-fef1-4350-bcc3-986e44325275');

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
  PRIMARY KEY (`id`, `roleName`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of role
-- ----------------------------
INSERT INTO `role` VALUES ('97a9de0a-01a3-42ff-9cc0-51eba5ca9747', 'Kabi', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/roles', 'e3739794-0ae5-4d2c-9eb7-0a48b2ded464', '#CC2222');
INSERT INTO `role` VALUES ('b031ffcf-daa3-49d8-adc0-757d716ef884', '呆猫', 'fatpaper-1304992673.cos.ap-guangzhou.myqcloud.com/monopoly/roles', '4f58c2c0-4695-47ad-90ad-891641e4ebba', '#001EFF');

-- ----------------------------
-- Table structure for street
-- ----------------------------
DROP TABLE IF EXISTS `street`;
CREATE TABLE `street`  (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `increase` float NOT NULL,
  `mapId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `FK_77a9e66101e2cec9b265ba40f33`(`mapId` ASC) USING BTREE,
  CONSTRAINT `FK_77a9e66101e2cec9b265ba40f33` FOREIGN KEY (`mapId`) REFERENCES `map` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of street
-- ----------------------------
INSERT INTO `street` VALUES ('04648184-8a02-4d00-9d17-7c92f8eb08bd', '东街', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `street` VALUES ('25316b68-8d5e-4ba8-a2dd-ceb2a003d893', '北街-1', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `street` VALUES ('29dfb1c5-3bc8-4fa0-a15b-5f4acae6c962', '南街-2', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `street` VALUES ('a745d851-304e-41cb-9569-7ad1eda285e7', '南街-1', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `street` VALUES ('b09d0cee-4bff-44a9-b943-92d706944438', '西街', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');
INSERT INTO `street` VALUES ('c4a69149-b0e5-46c0-bf06-0559bfa7ed0d', '123', 1, '26d4da24-6d54-4348-b1d8-83b4c336083a');
INSERT INTO `street` VALUES ('e9598b99-657a-498f-bc05-e32ce207dedf', '北街-2', 1, 'd01a06c2-fef1-4350-bcc3-986e44325275');

SET FOREIGN_KEY_CHECKS = 1;
