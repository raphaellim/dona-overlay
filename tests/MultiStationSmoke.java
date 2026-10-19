package example;
import com.google.gson.*;
public class MultiStationSmoke {
 public static void main(String[] args)throws Exception{
  if(ToonationReader.parseDonation(JsonParser.parseString("{\"amount\":12000,\"name\":\"후원자\"}").getAsJsonObject()).getAmount()!=12000)throw new AssertionError("amount");
  if(ToonationReader.parseDonation(JsonParser.parseString("{\"amount\":0}").getAsJsonObject())!=null)throw new AssertionError("zero");
  long start=System.currentTimeMillis();try(MultiStationService service=new MultiStationService()){Thread.sleep(400);service.close();}
  if(System.currentTimeMillis()-start>10000)throw new AssertionError("shutdown blocked");
  System.out.println("PASS Java parser / supervisor startup / repeated close / shutdown");
 }
}
