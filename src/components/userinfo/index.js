import './index.css';
import { frontendLogger } from '../../utils/logger.js';

function UserInfo(props) {

    let userInfo = props.userInfo
    if (!userInfo) {
        userInfo = {} 
    }
    frontendLogger.info('用户信息', { userInfo });

    return (
        <div className='userinfo'>
            <span className='name'>{ userInfo.name + 'Welcome to 钉钉' }</span>
        </div>
    );
}

export default UserInfo;

