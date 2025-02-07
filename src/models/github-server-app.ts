import { DataTypes, Sequelize, Model } from "sequelize";
import { sequelize } from "models/sequelize";
import { EncryptionSecretKeyEnum, EncryptionClient } from "utils/encryption-client";
import { getLogger } from "config/logger";

import EncryptedField from "sequelize-encrypted";

const encrypted = EncryptedField(Sequelize, process.env.STORAGE_SECRET);

const log = getLogger("GitHubServerApp");

interface GitHubServerAppPayload {
	uuid: string;
	appId: number;
	gitHubBaseUrl: string;
	gitHubClientId: string;
	gitHubClientSecret: string;
	webhookSecret: string;
	privateKey: string;
	gitHubAppName: string;
	installationId: number;
}

interface GitHubServerAppUpdatePayload {
	uuid: string;
	appId: number;
	gitHubBaseUrl?: string;
	gitHubClientId?: string;
	gitHubClientSecret?: string;
	webhookSecret?: string;
	privateKey?: string;
	gitHubAppName?: string;
	installationId?: number;
}

type SECRETE_FIELD = "gitHubClientSecret" | "webhookSecret" | "privateKey";

export class GitHubServerApp extends Model {
	id: number;
	uuid: string;
	appId: number;
	gitHubBaseUrl: string;
	gitHubClientId: string;
	gitHubClientSecret: string;
	webhookSecret: string;
	privateKey: string;
	gitHubAppName: string;
	installationId: number;
	updatedAt: Date;
	createdAt: Date;

	getDecryptedGitHubClientSecret(jiraHost: string): Promise<string> {
		return this.decrypt(jiraHost, "gitHubClientSecret");
	}

	getDecryptedPrivateKey(jiraHost: string): Promise<string>  {
		return this.decrypt(jiraHost, "privateKey");
	}

	getDecryptedWebhookSecret(jiraHost: string): Promise<string>  {
		return this.decrypt(jiraHost, "webhookSecret");
	}

	private async decrypt(jiraHost: string, field: SECRETE_FIELD): Promise<string> {
		try {
			return await EncryptionClient.decrypt(this[field], GitHubServerApp.getEncryptContext(jiraHost));
		} catch (e1) {
			try {
				const plainText = await EncryptionClient.decrypt(this[field], {});
				log.warn(`Fail to decrypt ${field} with jiraHost as encryptionContext, but empty encryptionContext success`);
				return plainText;
			} catch (e2) {
				log.error({ e1, e2 }, `Fail to decrypt ${field}`);
				throw e2;
			}
		}

	}

	private static async encrypt(jiraHost: string, plainText: string) {
		return await EncryptionClient.encrypt(EncryptionSecretKeyEnum.GITHUB_SERVER_APP, plainText, GitHubServerApp.getEncryptContext(jiraHost));
	}

	private static getEncryptContext(jiraHost: string) {
		return { jiraHost };
	}

	static async getForGitHubServerAppId(
		gitHubServerAppId: number
	): Promise<GitHubServerApp | null> {
		if (!gitHubServerAppId) {
			return null;
		}

		return this.findOne({
			where: {
				id: gitHubServerAppId
			}
		});
	}

	static async findForInstallationId(
		installationId: number
	): Promise<GitHubServerApp[] | null> {
		if (!installationId) {
			return null;
		}

		return this.findAll({
			where: {
				installationId: installationId
			}
		});
	}

	static async getAllForGitHubBaseUrlAndInstallationId(
		gitHubBaseUrl: string,
		installationId: number
	): Promise<GitHubServerApp[]> {
		return this.findAll({
			where: {
				gitHubBaseUrl,
				installationId
			}
		});
	}

	static async getForUuidAndInstallationId(
		uuid: string,
		installationId: number
	): Promise<GitHubServerApp | null> {
		return this.findOne({
			where: {
				uuid,
				installationId
			}
		});
	}

	static async install(payload: GitHubServerAppPayload, jiraHost: string): Promise<GitHubServerApp> {
		const {
			uuid,
			appId,
			gitHubAppName,
			gitHubBaseUrl,
			gitHubClientId,
			gitHubClientSecret,
			webhookSecret,
			privateKey,
			installationId
		} = payload;

		const [gitHubServerApp] = await this.findOrCreate({
			where: {
				gitHubClientId,
				gitHubBaseUrl
			},
			defaults: {
				uuid,
				appId,
				gitHubClientSecret: await GitHubServerApp.encrypt(jiraHost, gitHubClientSecret),
				webhookSecret: await GitHubServerApp.encrypt(jiraHost, webhookSecret),
				privateKey: await GitHubServerApp.encrypt(jiraHost, privateKey),
				gitHubAppName,
				installationId
			}
		});

		return gitHubServerApp;
	}

	static async uninstallApp(uuid: string): Promise<void> {
		await this.destroy({
			where: { uuid }
		});
	}

	static async uninstallServer(gitHubBaseUrl: string, installationId: number): Promise<void> {
		await this.destroy({
			where: { gitHubBaseUrl, installationId }
		});
	}

	static async updateGitHubAppByUUID(payload: GitHubServerAppUpdatePayload, jiraHost: string): Promise<void> {
		const {
			uuid,
			appId,
			gitHubAppName,
			gitHubBaseUrl,
			gitHubClientId,
			gitHubClientSecret,
			webhookSecret,
			privateKey,
			installationId
		} = payload;

		const existApp = await this.findForUuid(uuid);
		if (existApp) {
			await existApp.update({
				appId,
				gitHubClientId,
				gitHubBaseUrl,
				gitHubClientSecret: gitHubClientSecret ? await GitHubServerApp.encrypt(jiraHost, gitHubClientSecret) : undefined,
				webhookSecret: webhookSecret ? await GitHubServerApp.encrypt(jiraHost, webhookSecret) : undefined,
				privateKey: privateKey ? await GitHubServerApp.encrypt(jiraHost, privateKey) : undefined,
				gitHubAppName,
				installationId
			});
		}

	}

	static async findForUuid(uuid: string): Promise<GitHubServerApp | null> {
		return this.findOne({
			where: {
				uuid
			}
		});
	}
}

GitHubServerApp.init({
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		allowNull: false,
		autoIncrement: true
	},
	uuid: {
		type: DataTypes.UUID,
		defaultValue: DataTypes.UUIDV4,
		unique: true,
		allowNull: false
	},
	appId: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	gitHubBaseUrl: {
		type: DataTypes.STRING,
		allowNull: false
	},
	gitHubClientId: {
		type: DataTypes.STRING,
		allowNull: false
	},
	secrets: encrypted.vault("secrets"),
	gitHubClientSecret: {
		type: DataTypes.TEXT,
		field: "encryptedGitHubClientSecret",
		allowNull: false
	},
	webhookSecret: {
		type: DataTypes.TEXT,
		field: "encryptedWebhookSecret",
		allowNull: false
	},
	privateKey: {
		type: DataTypes.TEXT,
		field: "encryptedPrivateKey",
		allowNull: false
	},
	gitHubAppName: {
		type: DataTypes.STRING,
		allowNull: false
	},
	installationId: {
		type: DataTypes.INTEGER,
		allowNull: false
	}
}, {
	sequelize
});
