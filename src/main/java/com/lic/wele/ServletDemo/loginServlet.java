@WebServlet("/loginServlet")
public class loginServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        //第一步：接收用户名、密码

        String username;
        username= req.getParameter("username");
        String password;
        password= req.getParameter("password");
        byte[] bytes = username.getBytes(StandardCharsets.ISO_8859_1);
        username = new String(bytes, StandardCharsets.UTF_8);
        byte[] bytes1 = password.getBytes(StandardCharsets.ISO_8859_1);
        password = new String(bytes1, StandardCharsets.UTF_8);
        //第二步：调用Mybatis查询用户
        //工具类SqlSessionFactoryUtil调用方法返回sqlSessionFactory
        SqlSessionFactory sqlSessionFactory = SqlSessionFactoryUtil.getSqlSessionFactory();
        //  获取sqlSession对象，执行sql
        SqlSession sqlSession = sqlSessionFactory.openSession();
        //获取UserMapper接口的代理对象
        UserMapper mapper = sqlSession.getMapper(UserMapper.class);
        //获取方法
        User user = mapper.select(username, password);
        sqlSession.close();
        //获取字符的输出流 设置content-type
        resp.setContentType("text/html;charset=utf-8");
        PrintWriter writer = resp.getWriter();
        //第三步：判断
        if(user!=null){
            //登陆成功
            writer.write("登录成功");
        }else {
            //登录失败
            writer.write("登录失败");
        }
    }
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {

        this.doGet(req, resp);
    }
}

