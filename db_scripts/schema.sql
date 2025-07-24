-- 确保我们使用的是正确的数据库
CREATE DATABASE IF NOT EXISTS `family_tree` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `family_tree`;

-- 为了防止错误，按正确的顺序删除所有表
DROP TABLE IF EXISTS `invitations`;
DROP TABLE IF EXISTS `spouse_relations`;
DROP TABLE IF EXISTS `family_user_relations`;
DROP TABLE IF EXISTS `members`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `families`;
DROP TABLE IF EXISTS `users`;

-- 创建 users 表 (用户)
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(100) NOT NULL UNIQUE COMMENT '微信用户唯一标识',
  `nickname` VARCHAR(100) NULL COMMENT '用户昵称',
  `avatar_url` VARCHAR(255) NULL COMMENT '用户头像URL',
  `last_login_time` TIMESTAMP NULL COMMENT '最后登录时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '用户表';

-- 创建 refresh_tokens 表 (用于JWT刷新)
CREATE TABLE `refresh_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '存储用户的刷新令牌';

-- 创建 families 表 (家族)
CREATE TABLE `families` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '家族名称',
  `creator_id` INT NOT NULL COMMENT '创建者用户ID',
  `description` TEXT NULL COMMENT '家族简介',
  `introduction` TEXT NULL COMMENT '家族介绍/公告',
  `avatar` VARCHAR(255) NULL COMMENT '家族头像URL',
  `banner` VARCHAR(255) NULL COMMENT '家族背景图URL',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '家族表';

-- 创建 members 表 (家族成员)
CREATE TABLE `members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL COMMENT '所属家族ID',
  `name` VARCHAR(50) NOT NULL COMMENT '姓名',
  `gender` ENUM('male', 'female', 'other') NOT NULL COMMENT '性别',
  `status` ENUM('alive', 'deceased') NOT NULL DEFAULT 'alive' COMMENT '状态',
  `birth_date` VARCHAR(50) NULL COMMENT '出生日期 (字符串)',
  `death_date` VARCHAR(50) NULL COMMENT '去世日期 (字符串)',
  `father_id` INT NULL COMMENT '父亲ID',
  `mother_id` INT NULL COMMENT '母亲ID',
  `phone` VARCHAR(20) NULL,
  `wechat_id` VARCHAR(50) NULL COMMENT '用户手动填写的微信号',
  `original_address` VARCHAR(255) NULL,
  `current_address` VARCHAR(255) NULL,
  `occupation` VARCHAR(100) NULL,
  `avatar` VARCHAR(255) NULL COMMENT '成员头像URL',
  `photos` TEXT NULL COMMENT '成员照片集 (JSON格式的URL数组)',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`father_id`) REFERENCES `members`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`mother_id`) REFERENCES `members`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '家族成员表';

-- 创建 spouse_relations 表 (配偶关系，支持多配偶)
CREATE TABLE `spouse_relations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL,
  `member1_id` INT NOT NULL,
  `member2_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spouse_pair` (`member1_id`, `member2_id`),
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member1_id`) REFERENCES `members`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member2_id`) REFERENCES `members`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '配偶关系表';

-- 创建 family_user_relations 表 (用户与家族的关系)
CREATE TABLE `family_user_relations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` ENUM('admin', 'editor', 'member') NOT NULL DEFAULT 'member' COMMENT '用户角色',
  `member_id` INT NULL COMMENT '关联的成员ID (用于认领)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_user` (`family_id`, `user_id`),
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '家族与用户的关系及角色表';

-- 创建 invitations 表 (邀请)
CREATE TABLE `invitations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL,
  `inviter_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE COMMENT '唯一的邀请令牌',
  `status` ENUM('active', 'used', 'expired') NOT NULL DEFAULT 'active',
  `expires_at` TIMESTAMP NOT NULL COMMENT '过期时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '邀请表';
