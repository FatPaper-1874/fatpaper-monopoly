import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import type { GameMapChangelogEntry, GameMapInDb, GameMapStatus } from "@mine-monopoly/types";
import { User } from "#src/db/entities/User";

@Entity()
export class GameMap implements GameMapInDb {
	@PrimaryGeneratedColumn("uuid")
	id: string;

	@Column({ type: "varchar", nullable: false })
	name: string;

	@Column({ type: "varchar", nullable: false })
	author: string;

	@Column({ type: "int", nullable: false, default: 0 })
	version: number;

	@Column({ type: "text", nullable: true })
	description: string;

	/** 待审核版本的更新日志（本次上传时填写，审核通过后固化进 changelog） */
	@Column({ type: "text", nullable: true })
	pendingChangelog: string | null;

	/** 已发布版本的更新日志历史（JSON 数组，按版本升序；存量数据为 NULL 时按空数组兜底） */
	@Column({ type: "json", nullable: true })
	changelog: GameMapChangelogEntry[];

	@Column({ type: "varchar", nullable: false })
	coverUrl: string;

	@Column({ type: "varchar", length: 500, nullable: false })
	mapUrl: string;

	@Column({ type: "varchar", nullable: false })
	hash: string;

	@Column({ type: "boolean", nullable: false, default: false })
	inuse: boolean;

	@Index()
	@Column({ type: "varchar", length: 36, nullable: true })
	creatorId: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
	@JoinColumn({ name: "creatorId", referencedColumnName: "id" })
	creator?: User | null;

	@Index()
	@Column({ type: "varchar", length: 20, nullable: false, default: "reviewing" })
	status: GameMapStatus;

	@Column({ type: "text", nullable: true })
	rejectReason: string | null;

	@Column({ type: "varchar", length: 500, nullable: true })
	pendingUrl: string | null;

	/** 待审核版本的地图源文件（.fpmap）URL，与 pendingUrl 配对 */
	@Column({ type: "varchar", length: 500, nullable: true })
	pendingSourceUrl: string | null;

	/** 当前公开版本的地图源文件（.fpmap）URL，与 mapUrl 配对 */
	@Column({ type: "varchar", length: 500, nullable: true })
	sourceUrl: string | null;

	@Column({ type: "varchar", length: 64, nullable: true })
	pendingHash: string | null;

	@Column({ type: "varchar", length: 20, nullable: true })
	pendingVersion: string | null;
}