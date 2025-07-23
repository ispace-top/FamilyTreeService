-- 切换到我们的数据库
USE `family_tree`;

-- 最终修正删除顺序：先删除所有子表，再删除父表
DROP TABLE IF EXISTS `invitations`;
DROP TABLE IF EXISTS `family_members`;
DROP TABLE IF EXISTS `family_user_relations`;
DROP TABLE IF EXISTS `members`;
DROP TABLE IF EXISTS `families`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;


-- 创建 users 表 (最顶层父表)
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(100) NOT NULL UNIQUE COMMENT '微信用户唯一标识',
  `nickname` VARCHAR(100) NULL COMMENT '用户昵称',
  `avatar_url` VARCHAR(255) NULL COMMENT '用户头像URL',
  `last_login_time` TIMESTAMP NULL COMMENT '最后登录时间',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) COMMENT '用户表';

-- 创建 refresh_tokens 表
CREATE TABLE `refresh_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) COMMENT '存储用户的刷新令牌';


-- 创建 families 表 (依赖 users)
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
) COMMENT '家族表';


-- 创建 roles 表
CREATE TABLE `roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称',
  `description` TEXT NULL COMMENT '角色描述',
  PRIMARY KEY (`id`)
) COMMENT '角色表';

-- 插入默认角色数据
INSERT INTO `roles` (`name`, `description`) VALUES
('admin', '管理员，拥有全部权限'),
('editor', '编辑者，可添加和修改成员信息'),
('member', '成员，只能查看信息');

-- 创建 members 表
CREATE TABLE `members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL COMMENT '所属家族ID',
  `name` VARCHAR(50) NOT NULL COMMENT '姓名',
  `gender` ENUM('male', 'female') NOT NULL COMMENT '性别',
  `status` ENUM('alive', 'deceased') NOT NULL DEFAULT 'alive' COMMENT '状态',
  `birth_date` VARCHAR(50) NULL COMMENT '出生日期 (使用字符串以支持模糊日期)',
  `death_date` VARCHAR(50) NULL COMMENT '去世日期 (使用字符串以支持模糊日期)',
  `father_id` INT NULL COMMENT '父亲ID',
  `mother_id` INT NULL COMMENT '母亲ID',
  `spouse_id` INT NULL COMMENT '配偶ID',
  `phone` VARCHAR(20) NULL,
  `wechat_id` VARCHAR(50) NULL,
  `original_address` VARCHAR(255) NULL,
  `current_address` VARCHAR(255) NULL,
  `occupation` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) COMMENT '家族成员表';


-- 创建 family_user_relations 表 (依赖 users 和 families)
CREATE TABLE `family_user_relations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `family_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` ENUM('admin', 'editor', 'member') NOT NULL DEFAULT 'member' COMMENT '用户角色',
  `member_id` INT NULL COMMENT '关联的成员ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_user` (`family_id`, `user_id`),
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL
) COMMENT '家族与用户的关系表';

CREATE TABLE IF NOT EXISTS family_members (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `family_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL DEFAULT 3 COMMENT '默认为成员角色',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
  UNIQUE KEY `unique_family_user` (`family_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- 创建 invitations 表 (依赖 users 和 families)
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
) COMMENT '邀请表';
