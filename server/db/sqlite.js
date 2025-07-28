import sqlite3 from'sqlite3';
const sqlite = sqlite3.verbose();

import { logger } from '../util/logger.js';

// 数据库配置
const idTokenDBPath = 'idtoken_database.db';
const userinfoDBPath = 'userinfo_database.db';
const todoDBPath = 'todo_database.db';

// 全局数据库连接
let idTokenDB = null;
let userinfoDB = null;
let todoDB = null;

// 打开或初始化 todo 数据库
function openTodoDatabase() {
    if (!todoDB) {
        todoDB = new sqlite.Database(todoDBPath, (err) => {
            if (err) {
                logger.error('Error opening todo database:', err.message); 
                return;
            } else {
                logger.info('Connected to the todo database.');
                // 创建 users 表（如果不存在）
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
                            logger.info('Table "users" created successfully.');
                        }
                    });
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
                logger.info('dbInsertTodo taskid: ' + taskid + ', unionid: ' + unionid + ', meetingid: ' + meetingid + ', createtimestamp: ' + createtimestamp + ' inserted successfully');
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
                logger.info('查询待办信息成功:', meetingid);
                resolve(row);
            } else {
                logger.info('未找到待办信息:', meetingid);
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
                logger.info('Data deleted meetingid: ', meetingid);
                resolve('Data deleted successfully');
            }
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
                // 创建 users 表（如果不存在）
                userinfoDB.serialize(() => {
                    userinfoDB.run(`CREATE TABLE IF NOT EXISTS users (
                        userid TEXT PRIMARY KEY,
                        unionid TEXT NOT NULL,
                        name TEXT NOT NULL
                    )`, (err) => {
                        if (err) {
                            logger.error('Error creating table:', err.message);
                        } else {
                            logger.info('Table "users" created successfully.');
                        }
                    });
                });
            }
        });
    }
    return userinfoDB;
}

// 插入userinfo数据
function dbInsertUserinfo(userid, unionid, name) {
    return new Promise((resolve, reject) => {
        const db = openUserinfoDatabase();
        const insert = db.prepare('INSERT INTO users (userid, unionid, name) VALUES (?,?,?)');
        insert.run(userid, unionid, name, (err) => {
            insert.finalize();
            // 修复：避免每次操作都关闭数据库连接
            // db.close(); 
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
                logger.error('dbInsertUserinfo failed:', err.message);
            } else {
                logger.info('dbInsertUserinfo userid: ' + userid + ', unionid: ' + unionid + ', name: ' + name + ' inserted successfully');
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
                logger.info('查询用户信息成功:', userid);
                resolve(row);
            } else {
                logger.info('未找到用户:', userid);
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
            // 确保在操作完成后关闭数据库连接
            db.close();

            if (err) {
                logger.error('dbGetUserinfoByUnionid 查询失败:', err.message);
                reject(err); // 出错时 reject
            } else if (!row) {
                // 可选：如果没查到数据，也可以选择 reject 或 resolve(null)
                logger.info('dbGetUserinfoByUnionid 未找到 unionid 对应的用户:', unionid);
                resolve(null); // 或者 reject(new Error('User not found'));
            } else {
                logger.info("dbGetUserinfoByUnionid: ", unionid, " ", JSON.stringify(row));
                resolve(row); // 成功找到，返回查询结果
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
        const insert = db.prepare('INSERT INTO users (userid, idToken, expired) VALUES (?,?,?)');
        insert.run(userid, idToken, expired, (err) => {
            insert.finalize();
            // 修复：避免每次操作都关闭数据库连接
            // db.close(); 
            if (err) {
                // 修复：返回实际的错误对象
                reject(err); 
            } else {
                logger.info('dbInsertIdToken inserted userid: ' + userid + ', expired: ' + expired + ' successfully');
                resolve('dbInsertIdToken inserted successfully');
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
                logger.info('Data deleted userid: ', userid);
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
                logger.info('dbGetIdToken: ', userid);
                resolve(row);
            } else {
                // 没有找到记录，可以返回 null 或者自定义一个 '未找到' 的错误
                resolve(null); // 或者 reject(new Error('User not found'));
            }
        });
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
    openTodoDatabase,
    dbInsertTodo,
    dbGetTodoByMeetingid,
    dbDeleteTodoByMeetingid
};