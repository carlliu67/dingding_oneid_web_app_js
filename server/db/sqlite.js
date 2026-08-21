import path from 'path';
import sqlite3 from'sqlite3';
const sqlite = sqlite3.verbose();

import { logger } from '../util/logger.js';
import serverConfig from '../config/server_config.js';

// 数据库配置
const idTokenDBPath = path.join(process.cwd(), 'data', `idtoken.db`);
const userinfoDBPath = path.join(process.cwd(), 'data', `userinfo.db`);
const todoDBPath = path.join(process.cwd(), 'data', `todo.db`);
const calendarDBPath = path.join(process.cwd(), 'data', `calendar.db`);
const orgDBPath = path.join(process.cwd(), 'data', `org.db`);

// 全局数据库连接
let idTokenDB = null;
let userinfoDB = null;
let todoDB = null;
let calendarDB = null;
let orgDB = null;

// SQLite 并发配置
const SQLITE_BUSY_TIMEOUT = serverConfig.sqliteBusyTimeout || 30000; // 30秒超时
const SQLITE_WAL_MODE = serverConfig.sqliteWalMode !== false; // 启用WAL模式以提高并发性能

// 打开或初始化 todo 数据库
function openTodoDatabase() {
    if (!todoDB) {
        todoDB = new sqlite.Database(todoDBPath, (err) => {
            if (err) {
                logger.error('Error opening todo database:', err.message); 
                return;
            } else {
                logger.info('Connected to the todo database.');
                
                // 配置数据库以提高并发性能
                todoDB.configure("busyTimeout", SQLITE_BUSY_TIMEOUT);
                
                // 启用WAL模式以提高并发性能
                if (SQLITE_WAL_MODE) {
                    todoDB.run("PRAGMA journal_mode=WAL;", (err) => {
                        if (err) {
                            logger.error('Error setting WAL mode for todo database:', err.message);
                        } else {
                            logger.info('WAL mode enabled for todo database.');
                        }
                    });
                }
                
                // 创建 todo 表（如果不存在）
                todoDB.serialize(() => {
                    todoDB.run(`CREATE TABLE IF NOT EXISTS todo (
                        meetingid TEXT PRIMARY KEY,
                        taskid TEXT NOT NULL,
                        unionid TEXT NOT NULL,
                        createtimestamp INTEGER NOT NULL
                    )`, (err) => {
                        if (err) {
                            logger.error('Error creating table:', err.message);
                        } else {
                            logger.info('Table "todo" created successfully.');
                        }
                    });
                    // 为定时清理字段创建索引
                    todoDB.run(`CREATE INDEX IF NOT EXISTS idx_todo_createtimestamp ON todo(createtimestamp)`);
                });
            }
        });
    }
    return todoDB;
}

// 插入 todo 数据
function dbInsertTodo(meetingid, taskid, unionid, createtimestamp) {
    return new Promise((resolve, reject) => {
        const db = openTodoDatabase();
        const insert = db.prepare('INSERT INTO todo (meetingid, taskid, unionid, createtimestamp) VALUES (?,?,?,?)');
        insert.run(meetingid, taskid, unionid, createtimestamp, (err) => {
            insert.finalize();
            // 修复：避免每次操作都关闭数据库连接
            // db.close(); 
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
                logger.error('dbInsertTodo failed:', err.message);
            } else {
                logger.debug('dbInsertTodo taskid: ' + taskid + ', unionid: ' + unionid + ', meetingid: ' + meetingid + ', createtimestamp: ' + createtimestamp + ' inserted successfully');
                resolve('dbInsertTodo inserted successfully');
            }
        });
    });
}

// 根据meetingid查询待办数据
function dbGetTodoByMeetingid(meetingid) {
    if (!meetingid) {
        return Promise.reject(new Error('Error: meetingid is required'));
    }
    return new Promise((resolve, reject) => {
        const db = openTodoDatabase();
        const query = 'SELECT meetingid, taskid, unionid, createtimestamp FROM todo WHERE meetingid = ?';
        const values = [meetingid];

        db.get(query, values, (err, row) => {
            if (err) {
                logger.error('查询待办信息失败:', err.message);
                reject(err);
            } else if (row) {
                logger.debug('查询待办信息成功:', meetingid);
                resolve(row);
            } else {
                logger.debug('未找到待办信息:', meetingid);
                resolve(null); 
            }
        });
    });
}

// 删除待办数据
function dbDeleteTodoByMeetingid(meetingid) {
    return new Promise((resolve, reject) => {
        const db = openTodoDatabase();
        db.run('DELETE FROM todo WHERE meetingid = ?', meetingid, (err) => {
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
            } else {
                logger.debug('Data deleted meetingid: ', meetingid);
                resolve('Data deleted successfully');
            }
        });
    });
}

// 打开或初始化 calendar 数据库
let calendarDBInitialized = false;
let calendarDBPromise = null;

function openCalendarDatabase() {
    // 如果已经有初始化中的Promise，直接返回它
    if (calendarDBPromise) {
        return calendarDBPromise;
    }
    
    // 创建一个新的Promise来处理异步初始化
    calendarDBPromise = new Promise((resolve, reject) => {
        // 如果数据库已经初始化完成，直接返回
        if (calendarDBInitialized && calendarDB) {
            resolve(calendarDB);
            return;
        }
        
        if (!calendarDB) {
            calendarDB = new sqlite.Database(calendarDBPath, (err) => {
                if (err) {
                    logger.error('Error opening calendar database:', err.message); 
                    calendarDBPromise = null; // 重置Promise以便下次尝试
                    reject(err);
                    return;
                } else {
                    logger.info('Connected to the calendar database.');
                    
                    // 配置数据库以提高并发性能
                    calendarDB.configure("busyTimeout", SQLITE_BUSY_TIMEOUT);
                    
                    // 启用WAL模式以提高并发性能
                    if (SQLITE_WAL_MODE) {
                        calendarDB.run("PRAGMA journal_mode=WAL;", (err) => {
                            if (err) {
                                logger.error('Error setting WAL mode for calendar database:', err.message);
                            } else {
                                logger.info('WAL mode enabled for calendar database.');
                            }
                        });
                    }
                    
                    // 创建 calendar 表（如果不存在）
                    calendarDB.serialize(() => {
                        calendarDB.run(`CREATE TABLE IF NOT EXISTS calendar (
                            meetingid TEXT PRIMARY KEY,
                            scheduleId TEXT NOT NULL,
                            unionid TEXT NOT NULL,
                            createtimestamp INTEGER NOT NULL
                        )`, (err) => {
                            if (err) {
                                logger.error('Error creating table:', err.message);
                                calendarDBPromise = null;
                                reject(err);
                            } else {
                                logger.info('Table "calendar" created successfully.');
                                calendarDBInitialized = true;
                                resolve(calendarDB);
                            }
                        });
                        // 为定时清理字段创建索引
                        calendarDB.run(`CREATE INDEX IF NOT EXISTS idx_calendar_createtimestamp ON calendar(createtimestamp)`);
                    });
                }
            });
        } else {
            // 数据库已创建但可能未完全初始化，等待初始化完成
            // 这里简单处理，实际项目中可能需要更复杂的状态管理
            resolve(calendarDB);
        }
    });
    
    return calendarDBPromise;
}

// 插入 calendar 数据
function dbInsertCalendar(meetingid, scheduleId, unionid, createtimestamp) {
    return new Promise((resolve, reject) => {
        openCalendarDatabase().then(db => {
            // 执行插入
            const insert = db.prepare('INSERT INTO calendar (meetingid, scheduleId, unionid, createtimestamp) VALUES (?,?,?,?)');
            insert.run(meetingid, scheduleId, unionid, createtimestamp, (err) => {
                insert.finalize();
                // 避免每次操作都关闭数据库连接
                if (err) {
                    // 返回实际的错误对象
                    reject(err); 
                    logger.error('dbInsertCalendar failed:', err.message);
                } else {
                    logger.debug('dbInsertCalendar scheduleId: ' + scheduleId + ', unionid: ' + unionid + ', meetingid: ' + meetingid + ', createtimestamp: ' + createtimestamp + ' inserted successfully');
                    resolve('dbInsertCalendar inserted successfully');
                }
            });
        }).catch(err => {
            logger.error('dbInsertCalendar database error:', err.message);
            reject(err);
        });
    });
}

// 根据meetingid查询日历数据
function dbGetCalendarByMeetingid(meetingid) {
    if (!meetingid) {
        return Promise.reject(new Error('Error: meetingid is required'));
    }
    return new Promise((resolve, reject) => {
        openCalendarDatabase().then(db => {
            const query = 'SELECT meetingid, scheduleId, unionid, createtimestamp FROM calendar WHERE meetingid = ?';
            const values = [meetingid];

            db.get(query, values, (err, row) => {
                if (err) {
                    logger.error('查询日历信息失败:', err.message);
                    reject(err);
                } else if (row) {
                    logger.debug('查询日历信息成功:', meetingid);
                    resolve(row);
                } else {
                    logger.debug('未找到日历信息:', meetingid);
                    resolve(null); 
                }
            });
        }).catch(err => {
            logger.error('dbGetCalendarByMeetingid database error:', err.message);
            reject(err);
        });
    });
}

// 删除日历数据
function dbDeleteCalendarByMeetingid(meetingid) {
    if (!meetingid) {
        return Promise.reject(new Error('Error: meetingid is required'));
    }
    return new Promise((resolve, reject) => {
        openCalendarDatabase().then(db => {
            db.run('DELETE FROM calendar WHERE meetingid = ?', meetingid, (err) => {
                if (err) {
                    // 返回实际的错误对象
                    reject(err); 
                } else {
                    logger.debug('Calendar data deleted meetingid: ', meetingid);
                    resolve('Calendar data deleted successfully');
                }
            });
        }).catch(err => {
            logger.error('dbDeleteCalendarByMeetingid database error:', err.message);
            reject(err);
        });
    });
}

// 打开或初始化 userinfo 数据库
function openUserinfoDatabase() {
    if (!userinfoDB) {
        userinfoDB = new sqlite.Database(userinfoDBPath, (err) => {
            if (err) {
                logger.error('Error opening userinfo database:', err.message); 
                return;
            } else {
                logger.info('Connected to the userinfo database.');
                
                // 配置数据库以提高并发性能
                userinfoDB.configure("busyTimeout", SQLITE_BUSY_TIMEOUT);
                
                // 启用WAL模式以提高并发性能
                if (SQLITE_WAL_MODE) {
                    userinfoDB.run("PRAGMA journal_mode=WAL;", (err) => {
                        if (err) {
                            logger.error('Error setting WAL mode for userinfo database:', err.message);
                        } else {
                            logger.info('WAL mode enabled for userinfo database.');
                        }
                    });
                }
                
                // 创建 users 表（如果不存在）
                userinfoDB.serialize(() => {
                    userinfoDB.run(`CREATE TABLE IF NOT EXISTS users (
                        userid TEXT PRIMARY KEY,
                        unionid TEXT NOT NULL,
                        name TEXT NOT NULL,
                        lastupdatetime INTEGER
                    )`, (err) => {
                        if (err) {
                            logger.error('Error creating table:', err.message);
                        } else {
                            logger.info('Table "users" created successfully.');
                            // 兼容旧表：若 lastupdatetime 列不存在则添加（SQLite 不支持 IF NOT EXISTS 语法）
                            userinfoDB.run(`ALTER TABLE users ADD COLUMN lastupdatetime INTEGER`, (alterErr) => {
                                if (alterErr) {
                                    // 列已存在时会报错，属于正常情况，无需处理
                                    logger.debug('Column lastupdatetime already exists or alter skipped:', alterErr.message);
                                } else {
                                    logger.info('Column "lastupdatetime" added to table "users".');
                                }
                            });
                            // 为定时清理字段创建索引
                            userinfoDB.run(`CREATE INDEX IF NOT EXISTS idx_users_lastupdatetime ON users(lastupdatetime)`);
                        }
                    });
                 
                    // 创建 config 表（如果不存在）
                    userinfoDB.run(`CREATE TABLE IF NOT EXISTS config (
                        config_key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )`, (err) => {
                        if (err) {
                            logger.error('Error creating config table:', err.message);
                        } else {
                            logger.info('Table "config" created successfully.');
                        }
                    });
                });
            }
        });
    }
    return userinfoDB;
}

// 获取配置值
function dbGetConfig(key) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const query = 'SELECT value FROM config WHERE config_key = ?';
        const values = [key];

        db.get(query, values, (err, row) => {
            if (err) {
                logger.error('查询配置失败:', err.message);
                reject(err);
            } else if (row) {
                logger.debug('查询配置成功:', key, '=', row.value);
                resolve(row.value);
            } else {
                logger.debug('未找到配置:', key);
                resolve(null);
            }
        });
    });
}

// 设置配置值
function dbSetConfig(key, value) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const insert = db.prepare('INSERT OR REPLACE INTO config (config_key, value) VALUES (?,?)');
        insert.run(key, value, (err) => {
            insert.finalize();
            if (err) {
                reject(err);
                logger.error('设置配置失败:', err.message);
            } else {
                logger.debug('设置配置成功:', key, '=', value);
                resolve('配置设置成功');
            }
        });
    });
}

// ==================== 组织架构缓存（独立 org.db） ====================

// 打开或初始化组织架构缓存数据库
function openOrgDatabase() {
    if (!orgDB) {
        orgDB = new sqlite.Database(orgDBPath, (err) => {
            if (err) {
                logger.error('Error opening org database:', err.message);
                return;
            }
            logger.info('Connected to the org database.');

            // 配置数据库以提高并发性能
            orgDB.configure("busyTimeout", SQLITE_BUSY_TIMEOUT);

            // 启用WAL模式以提高并发性能
            if (SQLITE_WAL_MODE) {
                orgDB.run("PRAGMA journal_mode=WAL;", (err) => {
                    if (err) {
                        logger.error('Error setting WAL mode for org database:', err.message);
                    } else {
                        logger.info('WAL mode enabled for org database.');
                    }
                });
            }

            orgDB.serialize(() => {
                // 创建组织架构部门树表（单行存储 id=1）
                orgDB.run(`CREATE TABLE IF NOT EXISTS org_dept_tree (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    tree_data TEXT NOT NULL,
                    update_time INTEGER NOT NULL
                )`, (err) => {
                    if (err) {
                        logger.error('Error creating table org_dept_tree:', err.message);
                    } else {
                        logger.info('Table "org_dept_tree" created successfully.');
                    }
                });
                // 创建组织架构部门用户表
                orgDB.run(`CREATE TABLE IF NOT EXISTS org_dept_users (
                    dept_id TEXT PRIMARY KEY,
                    users_data TEXT NOT NULL,
                    update_time INTEGER NOT NULL
                )`, (err) => {
                    if (err) {
                        logger.error('Error creating table org_dept_users:', err.message);
                    } else {
                        logger.info('Table "org_dept_users" created successfully.');
                    }
                });
            });
        });
    }
    return orgDB;
}

// 获取组织架构部门树缓存（单行记录 id=1）
function dbGetOrgDeptTree() {
    return new Promise((resolve, reject) => {
        const db = openOrgDatabase();
        db.get('SELECT tree_data, update_time FROM org_dept_tree WHERE id = 1', (err, row) => {
            if (err) {
                logger.error('查询组织架构树缓存失败:', err.message);
                reject(err);
            } else if (row) {
                resolve({ treeData: row.tree_data, updateTime: Number(row.update_time) });
            } else {
                logger.debug('未找到组织架构树缓存');
                resolve(null);
            }
        });
    });
}

// 保存组织架构部门树缓存（单行记录 upsert）
function dbSetOrgDeptTree(treeData, updateTime) {
    return new Promise((resolve, reject) => {
        const db = openOrgDatabase();
        const insert = db.prepare('INSERT OR REPLACE INTO org_dept_tree (id, tree_data, update_time) VALUES (1, ?, ?)');
        insert.run(treeData, updateTime, (err) => {
            insert.finalize();
            if (err) {
                logger.error('保存组织架构树缓存失败:', err.message);
                reject(err);
            } else {
                logger.debug('保存组织架构树缓存成功');
                resolve('dbSetOrgDeptTree inserted successfully');
            }
        });
    });
}

// 获取部门用户列表缓存
function dbGetOrgDeptUsers(deptId) {
    if (!deptId) {
        return Promise.reject(new Error('Error: deptId is required'));
    }
    return new Promise((resolve, reject) => {
        const db = openOrgDatabase();
        db.get('SELECT users_data, update_time FROM org_dept_users WHERE dept_id = ?', [String(deptId)], (err, row) => {
            if (err) {
                logger.error('查询部门用户缓存失败:', err.message);
                reject(err);
            } else if (row) {
                resolve({ usersData: row.users_data, updateTime: Number(row.update_time) });
            } else {
                logger.debug('未找到部门用户缓存:', deptId);
                resolve(null);
            }
        });
    });
}

// 保存部门用户列表缓存（upsert）
function dbSetOrgDeptUsers(deptId, usersData, updateTime) {
    return new Promise((resolve, reject) => {
        const db = openOrgDatabase();
        const insert = db.prepare('INSERT OR REPLACE INTO org_dept_users (dept_id, users_data, update_time) VALUES (?, ?, ?)');
        insert.run(String(deptId), usersData, updateTime, (err) => {
            insert.finalize();
            if (err) {
                logger.error('保存部门用户缓存失败:', err.message);
                reject(err);
            } else {
                logger.debug('保存部门用户缓存成功: deptId=' + deptId);
                resolve('dbSetOrgDeptUsers inserted successfully');
            }
        });
    });
}

// 插入userinfo数据
function dbInsertUserinfo(userid, unionid, name) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const currentTime = Math.floor(Date.now() / 1000);
        const insert = db.prepare('INSERT OR REPLACE INTO users (userid, unionid, name, lastupdatetime) VALUES (?,?,?,?)');
        insert.run(userid, unionid, name, currentTime, (err) => {
            insert.finalize();
            // 修复：避免每次操作都关闭数据库连接
            // db.close(); 
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
                logger.error('dbInsertUserinfo failed:', err.message);
            } else {
                logger.debug('dbInsertUserinfo userid: ' + userid + ', unionid: ' + unionid + ', name: ' + name + ' inserted successfully');
                resolve('dbInsertUserinfo inserted successfully');
            }
        });
    });
}

// 根据userid查询userinfo数据
function dbGetUserinfoByUserid(userid) {
    if (!userid) {
        return Promise.reject(new Error('Error: userid is required'));
    }
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const query = 'SELECT userid, unionid, name FROM users WHERE userid = ?';
        const values = [userid];

        db.get(query, values, (err, row) => {
            if (err) {
                logger.error('查询用户信息失败:', err.message);
                reject(err);
            } else if (row) {
                logger.debug('查询用户信息成功:', userid);
                resolve(row);
            } else {
                logger.debug('未找到用户:', userid);
                resolve(null); // 或者 reject(new Error('用户不存在'))
            }
        });
    });
}

// 根据unionid查询userinfo数据
function dbGetUserinfoByUnionid(unionid) {
    if (!unionid) {
        return Promise.reject(new Error('Error: unionid is required'));
    }
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const query = 'SELECT userid, unionid, name FROM users WHERE unionid = ?';
        const values = [unionid];

        db.get(query, values, (err, row) => {
            if (err) {
                logger.error('dbGetUserinfoByUnionid 查询失败:', err.message);
                reject(err); // 出错时 reject
            } else if (!row) {
                // 可选：如果没查到数据，也可以选择 reject 或 resolve(null)
                logger.debug('dbGetUserinfoByUnionid 未找到 unionid 对应的用户:', unionid);
                resolve(null); // 或者 reject(new Error('User not found'));
            } else {
                logger.debug("dbGetUserinfoByUnionid: ", unionid, " ", JSON.stringify(row));
                resolve(row); // 成功找到，返回查询结果
            }
        });
    });
}

// 更新用户最后登录时间（用于定期清理判断，仅更新已存在的记录）
function dbUpdateUserLoginTime(userid) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const currentTime = Math.floor(Date.now() / 1000);
        db.run('UPDATE users SET lastupdatetime = ? WHERE userid = ?', [currentTime, userid], function (err) {
            if (err) {
                logger.error('dbUpdateUserLoginTime failed:', err.message);
                reject(err);
            } else {
                logger.debug('dbUpdateUserLoginTime userid: ' + userid + ', affected: ' + this.changes);
                resolve(this.changes);
            }
        });
    });
}

// 打开idtoken数据库
function openIdTokenDatabase() {
    if (!idTokenDB) {
        idTokenDB = new sqlite.Database(idTokenDBPath, (err) => {
            if (err) {
                logger.error(err.message); 
            } else {
                logger.info('Connected to the idtoken database.');
                
                // 配置数据库以提高并发性能
                idTokenDB.configure("busyTimeout", SQLITE_BUSY_TIMEOUT);
                
                // 启用WAL模式以提高并发性能
                if (SQLITE_WAL_MODE) {
                    idTokenDB.run("PRAGMA journal_mode=WAL;", (err) => {
                        if (err) {
                            logger.error('Error setting WAL mode for idtoken database:', err.message);
                        } else {
                            logger.info('WAL mode enabled for idtoken database.');
                        }
                    });
                }
                
                // 创建表，以 userid 为主键，包含 idToken 和 expired 字段
                idTokenDB.serialize(() => {
                    idTokenDB.run(`CREATE TABLE IF NOT EXISTS users (
                        userid TEXT PRIMARY KEY,
                        idToken TEXT NOT NULL,
                        expired DATETIME NOT NULL
                    )`, (err) => {
                        if (err) {
                            logger.error(err.message);
                        } else {
                            logger.info('Table created successfully.');
                        }
                    });
                    // 为定时清理字段创建索引
                    idTokenDB.run(`CREATE INDEX IF NOT EXISTS idx_idtoken_expired ON users(expired)`);
                });
            }
        });
    }
    return idTokenDB;
}

// 插入idtoken数据
function dbInsertIdToken(userid, idToken, expired) {
    return new Promise((resolve, reject) => {
        const db = openIdTokenDatabase();
        // 使用INSERT OR REPLACE避免唯一约束冲突
        const insert = db.prepare('INSERT OR REPLACE INTO users (userid, idToken, expired) VALUES (?,?,?)');
        insert.run(userid, idToken, expired, (err) => {
            insert.finalize();
            if (err) {
                reject(err); 
            } else {
                logger.debug('dbInsertIdToken inserted/replaced userid: ' + userid + ', expired: ' + expired + ' successfully');
                resolve('dbInsertIdToken inserted/replaced successfully');
            }
        });
    });
}

// 删除idtoken数据
function dbDeleteIdToken(userid) {
    return new Promise((resolve, reject) => {
        const db = openIdTokenDatabase();
        db.run('DELETE FROM users WHERE userid = ?', userid, (err) => {
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
            } else {
                logger.debug('Data deleted userid: ', userid);
                resolve('Data deleted successfully');
            }
        });
    });
}

// 读取idtoken数据
function dbGetIdToken(userid) {
    if (!userid) {
        return Promise.reject(new Error('Error: userid is required'));
    }
    return new Promise((resolve, reject) => {
        const db = openIdTokenDatabase(); // 假设这是一个返回 sqlite3.Database 实例的函数
        const query = 'SELECT userid, idToken, expired FROM users WHERE userid = ?';
        const values = [userid];

        db.get(query, values, (err, row) => {
            if (err) {
                logger.error(err.message);
                reject(err); // 发生错误，拒绝 Promise
            } else if (row) {
                // 找到了对应的记录
                logger.debug('dbGetIdToken: ', userid);
                resolve(row);
            } else {
                // 没有找到记录，可以返回 null 或者自定义一个 '未找到' 的错误
                resolve(null); // 或者 reject(new Error('User not found'));
            }
        });
    });
}

// ==================== 数据定时清理函数 ====================
// 分批删除配置：每批最多删除1000条，单次清理最多执行100批（10万条），避免长时间锁表
const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

// 清理已过期的 idToken 记录（分批删除）
function dbCleanupExpiredIdTokens() {
    return new Promise((resolve, reject) => {
        const db = openIdTokenDatabase();
        const currentTime = Math.floor(Date.now() / 1000);
        let totalDeleted = 0;
        let batchCount = 0;

        function deleteBatch() {
            db.run(`DELETE FROM users WHERE rowid IN (SELECT rowid FROM users WHERE expired < ? LIMIT ?)`,
                [currentTime, CLEANUP_BATCH_SIZE], function (err) {
                if (err) {
                    logger.error('清理过期idToken失败:', err.message);
                    reject(err);
                    return;
                }
                totalDeleted += this.changes;
                batchCount++;
                if (this.changes === CLEANUP_BATCH_SIZE && batchCount < CLEANUP_MAX_BATCHES) {
                    deleteBatch();
                } else {
                    logger.info(`清理过期idToken完成，删除 ${totalDeleted} 条记录`);
                    resolve(totalDeleted);
                }
            });
        }
        deleteBatch();
    });
}

// 清理超过保留期的 todo 记录（分批删除）
function dbCleanupOldTodos(retentionSeconds) {
    return new Promise((resolve, reject) => {
        const db = openTodoDatabase();
        const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
        let totalDeleted = 0;
        let batchCount = 0;

        function deleteBatch() {
            db.run(`DELETE FROM todo WHERE rowid IN (SELECT rowid FROM todo WHERE createtimestamp < ? LIMIT ?)`,
                [cutoff, CLEANUP_BATCH_SIZE], function (err) {
                if (err) {
                    logger.error('清理过期todo失败:', err.message);
                    reject(err);
                    return;
                }
                totalDeleted += this.changes;
                batchCount++;
                if (this.changes === CLEANUP_BATCH_SIZE && batchCount < CLEANUP_MAX_BATCHES) {
                    deleteBatch();
                } else {
                    logger.info(`清理过期todo完成，删除 ${totalDeleted} 条记录`);
                    resolve(totalDeleted);
                }
            });
        }
        deleteBatch();
    });
}

// 清理超过保留期的 calendar 记录（分批删除）
function dbCleanupOldCalendars(retentionSeconds) {
    return new Promise((resolve, reject) => {
        openCalendarDatabase().then(db => {
            const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
            let totalDeleted = 0;
            let batchCount = 0;

            function deleteBatch() {
                db.run(`DELETE FROM calendar WHERE rowid IN (SELECT rowid FROM calendar WHERE createtimestamp < ? LIMIT ?)`,
                    [cutoff, CLEANUP_BATCH_SIZE], function (err) {
                    if (err) {
                        logger.error('清理过期calendar失败:', err.message);
                        reject(err);
                        return;
                    }
                    totalDeleted += this.changes;
                    batchCount++;
                    if (this.changes === CLEANUP_BATCH_SIZE && batchCount < CLEANUP_MAX_BATCHES) {
                        deleteBatch();
                    } else {
                        logger.info(`清理过期calendar完成，删除 ${totalDeleted} 条记录`);
                        resolve(totalDeleted);
                    }
                });
            }
            deleteBatch();
        }).catch(err => {
            logger.error('dbCleanupOldCalendars database error:', err.message);
            reject(err);
        });
    });
}

// 清理超过保留期的用户信息记录（依据最后登录时间，分批删除）
function dbCleanupOldUserinfos(retentionSeconds) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const cutoff = Math.floor(Date.now() / 1000) - retentionSeconds;
        let totalDeleted = 0;
        let batchCount = 0;

        function deleteBatch() {
            db.run(`DELETE FROM users WHERE rowid IN (SELECT rowid FROM users WHERE lastupdatetime IS NOT NULL AND lastupdatetime < ? LIMIT ?)`,
                [cutoff, CLEANUP_BATCH_SIZE], function (err) {
                if (err) {
                    logger.error('清理过期用户信息失败:', err.message);
                    reject(err);
                    return;
                }
                totalDeleted += this.changes;
                batchCount++;
                if (this.changes === CLEANUP_BATCH_SIZE && batchCount < CLEANUP_MAX_BATCHES) {
                    deleteBatch();
                } else {
                    logger.info(`清理过期用户信息完成（最后登录时间早于${retentionSeconds}秒前），删除 ${totalDeleted} 条记录`);
                    resolve(totalDeleted);
                }
            });
        }
        deleteBatch();
    });
}

export {
    openIdTokenDatabase,
    dbInsertIdToken,
    dbDeleteIdToken,
    dbGetIdToken,
    openUserinfoDatabase,
    dbInsertUserinfo,
    dbGetUserinfoByUserid,
    dbGetUserinfoByUnionid,
    dbUpdateUserLoginTime,
    dbGetConfig,
    dbSetConfig,
    openOrgDatabase,
    dbGetOrgDeptTree,
    dbSetOrgDeptTree,
    dbGetOrgDeptUsers,
    dbSetOrgDeptUsers,
    openTodoDatabase,
    dbInsertTodo,
    dbGetTodoByMeetingid,
    dbDeleteTodoByMeetingid,
    openCalendarDatabase,
    dbInsertCalendar,
    dbGetCalendarByMeetingid,
    dbDeleteCalendarByMeetingid,
    dbCleanupExpiredIdTokens,
    dbCleanupOldTodos,
    dbCleanupOldCalendars,
    dbCleanupOldUserinfos
};