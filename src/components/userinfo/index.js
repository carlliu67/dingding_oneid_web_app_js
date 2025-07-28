import './index.css';

function UserInfo(props) {

    let userInfo = props.userInfo
    if (!userInfo) {
        userInfo = {} 
    }
    console.log(userInfo)

    return (
        <div className='userinfo'>
            <span className='name'>{ userInfo.name + 'Welcome to 钉钉' }</span>
        </div>
    );
}

export default UserInfo;

